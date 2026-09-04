#!/usr/bin/env python3
"""Compare sequential vs batched MADLAD generate on the production split path."""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from engines.madlad_mps import MADLADEngine  # noqa: E402

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

OUT_PATH = Path("/tmp/madlad-mps-batch-bench.json")


def run_mode(engine: MADLADEngine, batch_size: int) -> dict:
    engine._batch_size = batch_size
    results = {}
    for name, text in TEXTS.items():
        chunks = MADLADEngine._split_for_translation(text)
        print(f"\n=== {name} batch={batch_size} chunks={len(chunks)} warmup ===", flush=True)
        engine.translate(text, "en", "ja")
        print(f"=== {name} batch={batch_size} timed ===", flush=True)
        t0 = time.perf_counter()
        result = engine.translate(text, "en", "ja")
        wall_s = time.perf_counter() - t0
        results[name] = {
            "text": result.text,
            "chunks": len(chunks),
            "ms": result.translation_time_ms,
            "wall_s": wall_s,
            "in_tok": result.input_tokens,
            "out_tok": result.output_tokens,
            "tps": (result.output_tokens or 0) / wall_s if wall_s else 0,
        }
        print(
            f"  wall={wall_s:.3f}s chunks={len(chunks)} "
            f"in={result.input_tokens} out={result.output_tokens} ja={result.text}",
            flush=True,
        )
    return results


def main() -> None:
    engine = MADLADEngine()
    engine.load_model()
    sequential = run_mode(engine, 1)
    batched = run_mode(engine, 8)
    payload = {"sequential": sequential, "batched": batched}
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nwrote {OUT_PATH}", flush=True)
    for name in TEXTS:
        seq = sequential[name]
        bat = batched[name]
        same = seq["text"] == bat["text"]
        speed = seq["wall_s"] / bat["wall_s"] if bat["wall_s"] else 0
        print(
            f"{name}: {speed:.2f}x  same_text={same}  "
            f"seq={seq['wall_s']:.2f}s bat={bat['wall_s']:.2f}s",
            flush=True,
        )


if __name__ == "__main__":
    main()
