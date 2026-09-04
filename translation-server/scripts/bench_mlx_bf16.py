#!/usr/bin/env python3
"""MADLAD-400 3B MLX bfloat16 bench. Isolated from the PyTorch production server."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import mlx.core as mx
from transformers import AutoTokenizer

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

from bench_common import (  # noqa: E402
    MODEL_ID,
    dump_json,
    host_info,
    join_translated_chunks,
    load_corpus,
    max_new_tokens_for,
    quality_flags,
    rss_bytes,
    split_for_translation,
    summarize_runs,
)
from mlx_t5 import T5  # noqa: E402

OUT_DEFAULT = ROOT / "benchmarks" / "mlx-bf16.json"
MODEL_DEFAULT = ROOT / "models" / "madlad400-3b-mt-mlx-bf16"


def mlx_memory() -> dict[str, int | None]:
    active = None
    peak = None
    try:
        active = int(mx.get_active_memory())
    except Exception:
        active = None
    try:
        peak = int(mx.get_peak_memory())
    except Exception:
        peak = None
    return {
        "rss_bytes": rss_bytes(),
        "mlx_active_bytes": active,
        "mlx_peak_bytes": peak,
    }


def generate_chunk(
    model: T5,
    tokenizer,
    chunk: str,
    target_language: str,
) -> dict:
    prompt = f"<2{target_language}> {chunk}"
    encoded = tokenizer(
        prompt,
        return_tensors="np",
        truncation=True,
        max_length=512,
        add_special_tokens=True,
        padding=False,
    )
    prompt_ids = mx.array(encoded["input_ids"])
    in_tok = int(prompt_ids.shape[-1])
    limit = max_new_tokens_for(in_tok)
    eos_id = tokenizer.eos_token_id
    start_id = 0

    t_enc0 = time.perf_counter()
    memory = model.encode(prompt_ids)
    mx.eval(memory)
    encoder_s = time.perf_counter() - t_enc0

    y = mx.array([[start_id]])
    cache = None
    out_ids: list[int] = []
    first_token_s = None
    t_dec0 = time.perf_counter()
    for step in range(limit):
        logits, cache = model.decode(y, memory, cache=cache)
        token = mx.argmax(logits[:, -1, :], axis=-1)
        mx.eval(token, cache)
        if first_token_s is None:
            first_token_s = time.perf_counter() - t_dec0
        tid = int(token.item())
        if tid == eos_id:
            break
        out_ids.append(tid)
        y = token[:, None]
    decoder_s = time.perf_counter() - t_dec0
    text_out = tokenizer.decode(out_ids, skip_special_tokens=True).strip()
    return {
        "text": text_out,
        "input_tokens": in_tok,
        "output_tokens": len(out_ids),
        "max_new_tokens": limit,
        "hit_token_limit": len(out_ids) >= limit,
        "encoder_s": encoder_s,
        "decoder_s": decoder_s,
        "first_token_s": first_token_s or 0.0,
    }


def translate_text(model: T5, tokenizer, text: str, target_language: str) -> dict:
    chunks = split_for_translation(text)
    pieces: list[str] = []
    in_tok = 0
    out_tok = 0
    encoder_s = 0.0
    decoder_s = 0.0
    first_tokens: list[float] = []
    hit_limit = False
    max_new_used = 1
    t0 = time.perf_counter()
    for chunk in chunks:
        one = generate_chunk(model, tokenizer, chunk, target_language)
        pieces.append(one["text"])
        in_tok += one["input_tokens"]
        out_tok += one["output_tokens"]
        encoder_s += one["encoder_s"]
        decoder_s += one["decoder_s"]
        first_tokens.append(one["first_token_s"])
        hit_limit = hit_limit or one["hit_token_limit"]
        max_new_used = max(max_new_used, one["max_new_tokens"])
    mx.eval(mx.array(0))
    wall_s = time.perf_counter() - t0
    joined = join_translated_chunks(chunks, pieces, target_language)
    return {
        "translation": joined,
        "chunks": chunks,
        "pieces": pieces,
        "wall_s": wall_s,
        "wall_ms": wall_s * 1000,
        "input_chars": len(text),
        "output_chars": len(joined),
        "input_tokens": in_tok,
        "output_tokens": out_tok,
        "tokens_per_sec": (out_tok / wall_s) if wall_s else 0.0,
        "chars_per_sec": (len(joined) / wall_s) if wall_s else 0.0,
        "encoder_s": encoder_s,
        "decoder_s": decoder_s,
        "first_token_s": min(first_tokens) if first_tokens else 0.0,
        "hit_token_limit": hit_limit,
        "max_new_tokens": max_new_used,
        "memory": mlx_memory(),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=Path, default=MODEL_DEFAULT)
    parser.add_argument("--out", type=Path, default=OUT_DEFAULT)
    args = parser.parse_args()
    if not (args.model_dir / "model.safetensors").exists():
        raise SystemExit(
            f"missing {args.model_dir}/model.safetensors — run convert_madlad_mlx_bf16.py first"
        )

    try:
        mx.reset_peak_memory()
    except Exception:
        pass

    print(f"[MLX] loading bf16 weights from {args.model_dir}", flush=True)
    t_load = time.perf_counter()
    model = T5.from_bf16_dir(args.model_dir)
    load_s = time.perf_counter() - t_load
    print(f"[MLX] loaded in {load_s:.2f}s", flush=True)

    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, use_fast=False)
    tokenizer.padding_side = "right"

    corpus = load_corpus()
    cases_out = []
    sample_dtype = None
    try:
        sample_dtype = str(model.wte.weight.dtype)
    except Exception:
        sample_dtype = "bfloat16"

    for case in corpus["cases"]:
        text = case["text"]
        chunks = split_for_translation(text)
        print(f"\n=== {case['id']} chunks={len(chunks)} ===", flush=True)
        runs = []
        for phase in ("cold", "warm1", "warm2", "warm3"):
            measured = translate_text(model, tokenizer, text, "ja")
            measured["phase"] = phase
            runs.append(measured)
            print(
                f"  {phase}: {measured['wall_s']:.3f}s "
                f"enc={measured['encoder_s']:.3f}s dec={measured['decoder_s']:.3f}s "
                f"first={measured['first_token_s']:.3f}s "
                f"in={measured['input_tokens']} out={measured['output_tokens']} "
                f"tps={measured['tokens_per_sec']:.1f} hit_limit={measured['hit_token_limit']}",
                flush=True,
            )
            print(f"    ja={measured['translation'][:180]!r}", flush=True)
        summary = summarize_runs(runs)
        chosen = next(r for r in runs if r["phase"] == "warm2")
        flags = quality_flags(
            text,
            summary["warm_translation"],
            int(summary["warm_output_tokens"] or 0),
            int(chosen["max_new_tokens"]),
        )
        if chosen["hit_token_limit"]:
            flags["early_eos_suspected"] = True
        cases_out.append(
            {
                "id": case["id"],
                "name": case["name"],
                "input_chars": len(text),
                "chunks": len(chunks),
                "batch_size": 1,
                "runs": [
                    {
                        k: v
                        for k, v in run.items()
                        if k not in {"chunks", "pieces"}
                    }
                    for run in runs
                ],
                **summary,
                "quality": flags,
                "timing_breakdown": {
                    "encoder_s": chosen["encoder_s"],
                    "decoder_s": chosen["decoder_s"],
                    "first_token_s": chosen["first_token_s"],
                },
            }
        )

    payload = {
        "engine": "mlx-bf16",
        "model": MODEL_ID,
        "model_dir": str(args.model_dir),
        "device": "mlx",
        "dtype": sample_dtype,
        "batch_size": 1,
        "sentence_split": True,
        "generation": {
            "num_beams": 1,
            "do_sample": False,
            "max_new_tokens": "min(max(input*3+24, 48), 256)",
            "decoder_start_token_id": 0,
            "eos_token_id": tokenizer.eos_token_id,
        },
        "model_load_s": load_s,
        "peak_memory": mlx_memory(),
        "host": host_info(),
        "cases": cases_out,
    }
    dump_json(args.out, payload)


if __name__ == "__main__":
    main()
