#!/usr/bin/env python3
"""Production-path MADLAD MPS bfloat16 baseline. Does not change server.py."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from bench_common import (  # noqa: E402
    MODEL_ID,
    dump_json,
    host_info,
    load_corpus,
    max_new_tokens_for,
    quality_flags,
    rss_bytes,
    split_for_translation,
    summarize_runs,
)
from engines.madlad_mps import MADLADEngine  # noqa: E402

OUT_DEFAULT = ROOT / "benchmarks" / "mps-bf16-baseline.json"


def mps_memory() -> dict[str, int | None]:
    allocated = None
    driver = None
    if hasattr(torch, "mps") and torch.backends.mps.is_available():
        try:
            allocated = int(torch.mps.current_allocated_memory())
        except Exception:
            allocated = None
        try:
            driver = int(torch.mps.driver_allocated_memory())
        except Exception:
            driver = None
    return {
        "rss_bytes": rss_bytes(),
        "mps_current_allocated_bytes": allocated,
        "mps_driver_allocated_bytes": driver,
    }


def sync() -> None:
    if torch.backends.mps.is_available():
        torch.mps.synchronize()


def run_translate(engine: MADLADEngine, text: str) -> dict:
    sync()
    t0 = time.perf_counter()
    result = engine.translate(text, "en", "ja")
    sync()
    wall_s = time.perf_counter() - t0
    in_tok = int(result.input_tokens or 0)
    out_tok = int(result.output_tokens or 0)
    return {
        "translation": result.text,
        "wall_s": wall_s,
        "wall_ms": wall_s * 1000,
        "input_chars": result.input_chars,
        "output_chars": result.output_chars,
        "input_tokens": in_tok,
        "output_tokens": out_tok,
        "tokens_per_sec": (out_tok / wall_s) if wall_s else 0.0,
        "chars_per_sec": (result.output_chars / wall_s) if wall_s else 0.0,
        "engine_ms": result.translation_time_ms,
        "memory": mps_memory(),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=OUT_DEFAULT)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--sequential", action="store_true", help="Also time batch_size=1 after each case")
    args = parser.parse_args()

    corpus = load_corpus()
    engine = MADLADEngine()
    print("[MPS] loading production MADLAD on MPS bfloat16...", flush=True)
    t_load = time.perf_counter()
    engine.load_model()
    load_s = time.perf_counter() - t_load
    engine._batch_size = args.batch_size
    print(f"[MPS] loaded in {load_s:.2f}s device={engine._device} dtype={engine._dtype}", flush=True)

    actual_dtype = str(next(engine._model.parameters()).dtype)
    cases_out = []
    for case in corpus["cases"]:
        text = case["text"]
        chunks = split_for_translation(text)
        prod_chunks = MADLADEngine._split_for_translation(text)
        if chunks != prod_chunks:
            raise RuntimeError(f"split mismatch for {case['id']}: {chunks!r} vs {prod_chunks!r}")

        print(f"\n=== {case['id']} chunks={len(chunks)} batch={args.batch_size} ===", flush=True)
        phases = ["cold", "warm1", "warm2", "warm3"]
        runs = []
        for phase in phases:
            measured = run_translate(engine, text)
            measured["phase"] = phase
            runs.append(measured)
            print(
                f"  {phase}: {measured['wall_s']:.3f}s "
                f"in={measured['input_tokens']} out={measured['output_tokens']} "
                f"tps={measured['tokens_per_sec']:.1f}",
                flush=True,
            )
            print(f"    ja={measured['translation'][:180]!r}", flush=True)

        summary = summarize_runs(runs)
        max_new = max(max_new_tokens_for(t) for t in [max(1, summary["warm_input_tokens"] or 1)])
        flags = quality_flags(
            text,
            summary["warm_translation"],
            int(summary["warm_output_tokens"] or 0),
            max_new,
        )
        entry = {
            "id": case["id"],
            "name": case["name"],
            "input_chars": len(text),
            "chunks": len(chunks),
            "batch_size": args.batch_size,
            "runs": runs,
            **summary,
            "quality": flags,
        }

        if args.sequential:
            engine._batch_size = 1
            seq = run_translate(engine, text)
            seq["phase"] = "warm_sequential"
            engine._batch_size = args.batch_size
            entry["sequential_warm"] = seq
            print(
                f"  sequential: {seq['wall_s']:.3f}s tps={seq['tokens_per_sec']:.1f}",
                flush=True,
            )
        cases_out.append(entry)

    payload = {
        "engine": "pytorch-mps-bf16",
        "model": MODEL_ID,
        "device": str(engine._device),
        "dtype": actual_dtype,
        "batch_size": args.batch_size,
        "sentence_split": True,
        "generation": {
            "num_beams": 1,
            "do_sample": False,
            "max_new_tokens": "min(max(input*3+24, 48), 256)",
            "decoder_start_token_id": int(engine._model.config.decoder_start_token_id),
            "eos_token_id": engine._tokenizer.eos_token_id,
            "pad_token_id": engine._tokenizer.pad_token_id,
        },
        "model_load_s": load_s,
        "peak_memory": mps_memory(),
        "host": host_info(),
        "cases": cases_out,
    }
    dump_json(args.out, payload)
    engine.unload_model()


if __name__ == "__main__":
    main()
