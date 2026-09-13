"""Score cross-lingual semantic coverage for audited translations.

This is an audit signal, not a production gate.  It uses a local/free
multilingual sentence-embedding model through the already-installed
Transformers package and compares each English source sentence against the
Japanese translation.  Low minimum source-sentence similarity is a candidate
omission/semantic-drift signal for manual review.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import torch
import torch.nn.functional as F
from transformers import AutoModel, AutoTokenizer


ROOT = Path(__file__).resolve().parents[2]
SERVER_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER_ROOT))
DEFAULT_REVIEW = ROOT / "test-data/real-papers/audit-manual-review.json"
DEFAULT_OUTPUT = ROOT / "test-data/real-papers/reports/semantic-coverage.json"
DEFAULT_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

from engines.segmenter import split_for_translation  # noqa: E402


def _split_english_sentences(text: str) -> list[str]:
    parts = split_for_translation(" ".join(text.split()))
    return [part.strip() for part in parts if len(part.split()) >= 4]


def _split_japanese_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[。！？!?])\s*", " ".join(text.split()))
    return [part.strip() for part in parts if len(part.strip()) >= 8]


def _mean_pool(model_output, attention_mask):
    token_embeddings = model_output[0]
    input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
    return torch.sum(token_embeddings * input_mask_expanded, 1) / torch.clamp(
        input_mask_expanded.sum(1), min=1e-9
    )


def _encode(texts: list[str], tokenizer, model, device: str) -> torch.Tensor:
    encoded = tokenizer(
        texts,
        padding=True,
        truncation=True,
        max_length=256,
        return_tensors="pt",
    ).to(device)
    with torch.inference_mode():
        output = model(**encoded)
    embeddings = _mean_pool(output, encoded["attention_mask"])
    return F.normalize(embeddings, p=2, dim=1)


def _score_pair(source: str, translation: str, tokenizer, model, device: str) -> dict:
    source_sentences = _split_english_sentences(source) or [source]
    target_sentences = _split_japanese_sentences(translation) or [translation]
    texts = [source, translation, *source_sentences, *target_sentences]
    embeddings = _encode(texts, tokenizer, model, device)
    full_similarity = float(torch.matmul(embeddings[0], embeddings[1]).item())
    source_emb = embeddings[2 : 2 + len(source_sentences)]
    target_emb = embeddings[2 + len(source_sentences) :]
    matrix = torch.matmul(source_emb, target_emb.T)
    best_by_source = matrix.max(dim=1).values.tolist()
    best_by_target = matrix.max(dim=0).values.tolist()
    min_source_sentence_similarity = min(best_by_source) if best_by_source else full_similarity
    mean_source_sentence_similarity = sum(best_by_source) / max(1, len(best_by_source))
    min_target_sentence_similarity = min(best_by_target) if best_by_target else full_similarity
    return {
        "fullSimilarity": full_similarity,
        "sourceSentenceCount": len(source_sentences),
        "targetSentenceCount": len(target_sentences),
        "minSourceSentenceSimilarity": min_source_sentence_similarity,
        "meanSourceSentenceSimilarity": mean_source_sentence_similarity,
        "minTargetSentenceSimilarity": min_target_sentence_similarity,
        "sourceSentences": source_sentences,
        "targetSentences": target_sentences,
        "bestBySource": best_by_source,
        "bestByTarget": best_by_target,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(DEFAULT_REVIEW))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--only-reviewed", action="store_true")
    parser.add_argument("--only-accepts", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    reviews = payload.get("reviews", [])
    if args.only_reviewed:
        reviews = [row for row in reviews if row.get("reviewedAt")]
    if args.only_accepts:
        reviews = [row for row in reviews if row.get("productionDecision") == "accept"]
    if args.limit:
        reviews = reviews[: args.limit]

    print(f"loading {args.model} for {len(reviews)} rows")
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModel.from_pretrained(args.model)
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model = model.to(device)
    model.eval()

    rows = []
    for index, row in enumerate(reviews, 1):
        source = str(row.get("source") or "")
        translation = str(row.get("translation") or "")
        if not source or not translation or translation == "[original fallback]":
            continue
        scores = _score_pair(source, translation, tokenizer, model, device)
        result = {
            "key": row.get("key"),
            "paperId": row.get("paperId"),
            "blockId": row.get("blockId"),
            "productionDecision": row.get("productionDecision"),
            "labels": row.get("labels", []),
            "severity": row.get("severity", 0),
            "reviewedAt": row.get("reviewedAt"),
            **scores,
        }
        rows.append(result)
        Path(args.output).write_text(
            json.dumps(
                {
                    "model": args.model,
                    "count": len(rows),
                    "rows": rows,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        print(
            f"[{index}/{len(reviews)}] {row.get('paperId')} {row.get('blockId')} "
            f"full={scores['fullSimilarity']:.3f} "
            f"minSrc={scores['minSourceSentenceSimilarity']:.3f} "
            f"meanSrc={scores['meanSourceSentenceSimilarity']:.3f}",
            flush=True,
        )

    reviewed = [row for row in rows if row.get("reviewedAt")]
    if reviewed:
        safe = [row for row in reviewed if int(row.get("severity") or 0) < 2]
        unsafe = [row for row in reviewed if int(row.get("severity") or 0) >= 2]

        def avg(items: list[dict], key: str) -> float | None:
            return sum(float(item[key]) for item in items) / len(items) if items else None

        summary = {
            "reviewed": len(reviewed),
            "safeReviewed": len(safe),
            "unsafeReviewed": len(unsafe),
            "safeAvgMinSource": avg(safe, "minSourceSentenceSimilarity"),
            "unsafeAvgMinSource": avg(unsafe, "minSourceSentenceSimilarity"),
            "safeAvgFull": avg(safe, "fullSimilarity"),
            "unsafeAvgFull": avg(unsafe, "fullSimilarity"),
        }
    else:
        summary = {}
    Path(args.output).write_text(
        json.dumps(
            {
                "model": args.model,
                "count": len(rows),
                "summary": summary,
                "rows": rows,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
