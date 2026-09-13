"""Compare a local Hugging Face translation model against audit fallbacks.

This is an evaluation harness, not a production cascade.  It translates rows
that the current Paper Reader pipeline kept as original text, then writes raw
outputs for TypeScript quality scoring and manual semantic review.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
from transformers import (
    AutoModelForSeq2SeqLM,
    AutoTokenizer,
    M2M100ForConditionalGeneration,
    M2M100Tokenizer,
)


ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "test-data/real-papers/reports/translation-audit.json"
REPORT_DIR = ROOT / "test-data/real-papers/reports"


def _load_rows(category: str, limit: int) -> list[dict[str, str]]:
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    rows: list[dict[str, str]] = []
    for paper in audit["papers"]:
        for row in paper.get("rows", []):
            if row.get("sourceCategory") == category and row.get("sourceFallback"):
                rows.append(
                    {
                        "paperId": paper["paper"]["id"],
                        "blockId": row["blockId"],
                        "source": row["source"],
                    }
                )
    return rows[:limit] if limit else rows


def _load_model(model_name: str):
    if model_name.startswith("facebook/m2m100_"):
        tokenizer = M2M100Tokenizer.from_pretrained(model_name)
        model = M2M100ForConditionalGeneration.from_pretrained(model_name)
        tokenizer.src_lang = "en"
        forced_bos_token_id = tokenizer.get_lang_id("ja")
    else:
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
        forced_bos_token_id = None
    return tokenizer, model, forced_bos_token_id


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--category", default="ordinary-body-prose")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--output", default="")
    args = parser.parse_args()

    rows = _load_rows(args.category, args.limit)
    output = Path(args.output) if args.output else REPORT_DIR / (
        "model-cascade-"
        + args.model.replace("/", "-").replace("_", "-").replace(".", "-")
        + f"-{args.category}.json"
    )
    print(f"loading {args.model} for {len(rows)} {args.category} fallback rows")
    tokenizer, model, forced_bos_token_id = _load_model(args.model)
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model = model.to(device)
    model.eval()

    results = []
    for index, row in enumerate(rows, 1):
        start = time.time()
        encoded = tokenizer(
            row["source"],
            return_tensors="pt",
            truncation=True,
            max_length=512,
        ).to(device)
        generate_kwargs = {
            "max_new_tokens": 256,
            "num_beams": 1,
            "do_sample": False,
            "no_repeat_ngram_size": 4,
        }
        if forced_bos_token_id is not None:
            generate_kwargs["forced_bos_token_id"] = forced_bos_token_id
        with torch.inference_mode():
            generated = model.generate(**encoded, **generate_kwargs)
        translated = tokenizer.decode(generated[0], skip_special_tokens=True).strip()
        result = {
            **row,
            "model": args.model,
            "translation": translated,
            "inputTokens": int(encoded["input_ids"].shape[1]),
            "outputTokens": int(generated.shape[1]),
            "timeMs": (time.time() - start) * 1000,
        }
        results.append(result)
        output.write_text(
            json.dumps(
                {
                    "model": args.model,
                    "category": args.category,
                    "count": len(results),
                    "results": results,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        print(
            f"[{index}/{len(rows)}] {row['paperId']} {row['blockId']} "
            f"{result['inputTokens']}->{result['outputTokens']} {translated[:140]}",
            flush=True,
        )
    print(f"wrote {output}")


if __name__ == "__main__":
    main()
