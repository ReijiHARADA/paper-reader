#!/usr/bin/env python3
"""Measure citation protect/restore on the fixed corpus against a live MADLAD server.

Does not change MADLAD_BATCH_SIZE / micro-batch settings.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

from engines.citation_protect import protect_citations, restore_citations
from scripts.bench_common import CORPUS_PATH, extract_citations, load_corpus

SERVER = "http://127.0.0.1:8765"


def post_translate(text: str) -> dict:
    payload = json.dumps(
        {"text": text, "source_language": "en", "target_language": "ja"}
    ).encode()
    req = urllib.request.Request(
        f"{SERVER}/translate",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode())


def main() -> int:
    try:
        with urllib.request.urlopen(f"{SERVER}/health", timeout=3) as resp:
            health = json.loads(resp.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"SKIP: MADLAD server not reachable ({exc})")
        return 0

    corpus = load_corpus(CORPUS_PATH)
    case = next(c for c in corpus["cases"] if c["id"] == "citations")
    source = case["text"]
    expected = extract_citations(source)
    protected, cites, nonce = protect_citations(source)
    assert cites == ["[8]", "[12]", "[3]"], cites

    t0 = time.time()
    result = post_translate(source)
    wall_s = time.time() - t0
    translated = result.get("text") or ""
    restored_check = restore_citations(protected, cites, nonce)
    assert restored_check == source

    missing = [c for c in expected if c not in translated]
    out = {
        "health": health,
        "wall_s": round(wall_s, 3),
        "input_tokens": result.get("input_tokens"),
        "output_tokens": result.get("output_tokens"),
        "translation": translated,
        "source_citations": expected,
        "missing_citations": missing,
        "placeholder_roundtrip": restored_check == source,
        "protected_preview": protected,
    }
    dest = Path(__file__).resolve().parents[1] / "benchmarks" / "citation-protect.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False, indent=2))
    if missing:
        print(f"FAIL: missing citations {missing}")
        return 1
    print(f"OK: citations kept in {wall_s:.2f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
