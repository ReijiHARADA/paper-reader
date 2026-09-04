#!/usr/bin/env python3
"""Convert google/madlad400-3b-mt to MLX bfloat16. No quantization."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

import torch
from huggingface_hub import snapshot_download
from safetensors.torch import save_file
from safetensors import safe_open

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from bench_common import MODEL_ID, dump_json, host_info  # noqa: E402

DEFAULT_OUT = ROOT / "models" / "madlad400-3b-mt-mlx-bf16"
META_OUT = ROOT / "benchmarks" / "mlx-bf16-conversion.json"
TOKENIZER_FILES = [
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "spiece.model",
    "added_tokens.json",
]


def remap_embeddings(weights: dict[str, torch.Tensor]) -> dict[str, torch.Tensor]:
    """Use decoder.embed_tokens as shared input embeddings, keep lm_head separate."""
    out = dict(weights)
    if "decoder.embed_tokens.weight" in out:
        out["shared.weight"] = out.pop("decoder.embed_tokens.weight")
    out.pop("encoder.embed_tokens.weight", None)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--dtype", choices=["bfloat16"], default="bfloat16")
    args = parser.parse_args()
    if args.dtype != "bfloat16":
        raise SystemExit("this converter is bf16-only")

    print(f"snapshot {MODEL_ID}", flush=True)
    src = Path(
        snapshot_download(
            MODEL_ID,
            allow_patterns=[
                "model.safetensors",
                "config.json",
                "generation_config.json",
                *TOKENIZER_FILES,
            ],
        )
    )
    src_weight = src / "model.safetensors"
    args.out.mkdir(parents=True, exist_ok=True)

    t0 = time.perf_counter()
    converted: dict[str, torch.Tensor] = {}
    dtypes: dict[str, int] = {}
    with safe_open(str(src_weight), framework="pt", device="cpu") as handle:
        keys = list(handle.keys())
        for i, key in enumerate(keys, start=1):
            tensor = handle.get_tensor(key)
            if tensor.dtype.is_floating_point:
                tensor = tensor.to(dtype=torch.bfloat16)
            converted[key] = tensor.contiguous()
            dtypes[str(converted[key].dtype)] = dtypes.get(str(converted[key].dtype), 0) + 1
            if i % 80 == 0 or i == len(keys):
                print(f"  converted {i}/{len(keys)}", flush=True)
    converted = remap_embeddings(converted)

    weight_path = args.out / "model.safetensors"
    print(f"writing {weight_path}", flush=True)
    save_file(converted, str(weight_path))
    convert_s = time.perf_counter() - t0

    config = json.loads((src / "config.json").read_text(encoding="utf-8"))
    config["weight_dtype"] = "bfloat16"
    config["quantization"] = None
    config["feed_forward_proj"] = config.get("feed_forward_proj", "gated-gelu")
    (args.out / "config.json").write_text(
        json.dumps(config, indent=2) + "\n", encoding="utf-8"
    )
    for name in TOKENIZER_FILES + ["generation_config.json"]:
        src_file = src / name
        if src_file.exists():
            shutil.copy2(src_file, args.out / name)

    nbytes = weight_path.stat().st_size
    n_params = sum(t.numel() for t in converted.values())
    meta = {
        "source_model": MODEL_ID,
        "output_dir": str(args.out),
        "weight_dtype": "bfloat16",
        "quantization": None,
        "conversion_s": convert_s,
        "weight_bytes": nbytes,
        "weight_gib": round(nbytes / (1024**3), 3),
        "tensor_count": len(converted),
        "parameter_count": int(n_params),
        "tensor_dtypes": dtypes,
        "embedding_mapping": "decoder.embed_tokens -> shared; lm_head untied",
        "host": host_info(),
    }
    dump_json(META_OUT, meta)
    print(
        f"done dtype=bfloat16 size={meta['weight_gib']} GiB "
        f"params={n_params/1e9:.2f}B time={convert_s:.1f}s",
        flush=True,
    )


if __name__ == "__main__":
    main()
