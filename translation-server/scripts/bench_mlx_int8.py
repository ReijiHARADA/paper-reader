#!/usr/bin/env python3
"""MADLAD-400 3B MLX INT8 bench. Isolated from the PyTorch MPS server."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from huggingface_hub import snapshot_download
from transformers import AutoTokenizer

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from mlx_t5 import T5  # noqa: E402

import mlx.core as mx  # noqa: E402

TEXTS = {
    "short": "Attention is all you need introduced the Transformer architecture for neural machine translation.",
    "walkman": "Devices that used to be static were extended with portable variations: for example the Walkman and the cell phone.",
    "intro": (
        "Over the last decennia electronics rapidly miniaturised while gaining computing power. "
        "Devices that used to be static were extended with portable variations: for example the Walkman and the cell phone. "
        "More recently electronics have become small enough to be worn directly on the human body integrated in our apparel. "
        "Driven by technological possibilities it seems logical to focus on new practical functionalities. "
        "However such an approach neglects interesting aspects of clothing and accessory like the implications of the proximity to the human body and its rich material and social connotations. "
        "In line with van Dijk et al. [8] we see it as ‘our challenge to orchestrate social, human and technological resources’ with an emphasis on human values and practices."
    ),
    "title": "Interactive Jewellery: a design exploration",
}

OUT_PATH = Path("/tmp/madlad-mlx-int8-bench.json")


def download_int8() -> Path:
    path = snapshot_download(
        repo_id="aufklarer/MADLAD400-3B-MT-MLX",
        allow_patterns=["int8/*"],
    )
    return Path(path) / "int8"


def inspect_weights(model_dir: Path) -> None:
    weights = mx.load(str(model_dir / "model.safetensors"))
    keys = sorted(weights.keys())
    print(f"weight keys: {len(keys)}")
    for key in keys[:40]:
        arr = weights[key]
        print(f"  {key}: shape={arr.shape} dtype={arr.dtype}")
    print("  ...")
    for needle in ("shared", "lm_head", "embed", "scales", "biases", "wi_0"):
        hits = [k for k in keys if needle in k]
        print(f"  contains {needle!r}: {len(hits)} e.g. {hits[:3]}")


def max_new_tokens(input_tokens: int) -> int:
    return min(max(input_tokens * 3 + 24, 48), 256)


def generate_ja(model: T5, tokenizer, text: str) -> tuple[str, int, int]:
    prompt = f"<2ja> {text}"
    encoded = tokenizer(
        prompt,
        return_tensors="np",
        return_attention_mask=False,
    )["input_ids"]
    prompt_ids = mx.array(encoded)
    in_tok = int(prompt_ids.shape[-1])
    limit = max_new_tokens(in_tok)
    eos_id = tokenizer.eos_token_id
    start_id = 0

    memory = model.encode(prompt_ids)
    mx.eval(memory)

    y = mx.array([[start_id]])
    cache = None
    out_ids: list[int] = []
    for _ in range(limit):
        logits, cache = model.decode(y, memory, cache=cache)
        token = mx.argmax(logits[:, -1, :], axis=-1)
        mx.eval(token, cache)
        tid = int(token.item())
        if tid == eos_id:
            break
        out_ids.append(tid)
        y = token[:, None]

    text_out = tokenizer.decode(out_ids, skip_special_tokens=True).strip()
    return text_out, in_tok, len(out_ids)


def run_case(model: T5, tokenizer, name: str, text: str) -> dict:
    print(f"\n=== {name} warmup ===", flush=True)
    generate_ja(model, tokenizer, text)
    print(f"=== {name} timed ===", flush=True)
    t0 = time.perf_counter()
    ja, in_tok, out_tok = generate_ja(model, tokenizer, text)
    wall_s = time.perf_counter() - t0
    tps = out_tok / wall_s if wall_s > 0 else 0.0
    print(f"  wall={wall_s:.3f}s in={in_tok} out={out_tok} tps={tps:.1f}", flush=True)
    print(f"  ja={ja}", flush=True)
    return {
        "text": ja,
        "ms": wall_s * 1000,
        "wall_s": wall_s,
        "in_tok": in_tok,
        "out_tok": out_tok,
        "tps": tps,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inspect-only", action="store_true")
    parser.add_argument("--load-only", action="store_true")
    args = parser.parse_args()

    print("Downloading INT8 weights...", flush=True)
    model_dir = download_int8()
    print(f"model_dir={model_dir}", flush=True)
    inspect_weights(model_dir)
    if args.inspect_only:
        return

    print("Loading quantized T5...", flush=True)
    t0 = time.perf_counter()
    model = T5.from_int8_dir(model_dir)
    load_s = time.perf_counter() - t0
    print(f"loaded in {load_s:.1f}s", flush=True)
    if args.load_only:
        return

    tokenizer = AutoTokenizer.from_pretrained(model_dir, legacy=False)
    results = {"load_s": load_s}
    for name, text in TEXTS.items():
        results[name] = run_case(model, tokenizer, name, text)

    OUT_PATH.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nwrote {OUT_PATH}", flush=True)


if __name__ == "__main__":
    main()
