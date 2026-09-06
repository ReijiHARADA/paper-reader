"""Shared helpers for isolated MADLAD benchmarks. No torch / mlx imports."""

from __future__ import annotations

import json
import platform
import re
import statistics
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from engines.segmenter import split_for_translation

ROOT = Path(__file__).resolve().parents[1]
CORPUS_PATH = ROOT / "benchmarks" / "corpus.json"
MODEL_ID = "google/madlad400-3b-mt"



def load_corpus(path: Path = CORPUS_PATH) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def max_new_tokens_for(input_tokens: int) -> int:
    return min(max(input_tokens * 3 + 24, 48), 256)




def to_halfwidth_ascii(text: str) -> str:
    out: list[str] = []
    for ch in text:
        code = ord(ch)
        if 0xFF01 <= code <= 0xFF5E:
            out.append(chr(code - 0xFEE0))
        elif code == 0x3000:
            out.append(" ")
        else:
            out.append(ch)
    converted = "".join(out)
    return re.sub(r"([,;:])(?=[\u3040-\u30FF\u4E00-\u9FFF])", r"\1 ", converted)


def join_translated_chunks(chunks: list[str], pieces: list[str], target_language: str) -> str:
    if target_language != "ja":
        return " ".join(pieces).strip()
    out: list[str] = []
    for i, (chunk, piece) in enumerate(zip(chunks, pieces)):
        piece = piece.strip()
        source_end = chunk.rstrip()[-1:] if chunk.rstrip() else ""
        ja_end = piece[-1:] if piece else ""
        if (
            source_end in ".!?"
            and ja_end not in "。！？.!?"
            and not re.fullmatch(r"\d+[.)]", chunk.strip())
        ):
            piece += "。"
        elif source_end not in ".!?" and len(chunk) < 80 and piece.endswith("を"):
            piece = piece[:-1]
        if i > 0:
            prev = chunks[i - 1].rstrip()
            prev_piece = out[-1] if out else ""
            if prev.endswith(":") and prev_piece and prev_piece[-1] not in "。！？：、:":
                out.append(":")
        out.append(piece)
    joined = "".join(out).strip()
    joined = re.sub(r"[:：]+", ":", joined)
    return to_halfwidth_ascii(joined)


def host_info() -> dict[str, Any]:
    return {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "machine": platform.machine(),
        "mac_ver": platform.mac_ver()[0],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def rss_bytes() -> int | None:
    try:
        import psutil

        return int(psutil.Process().memory_info().rss)
    except Exception:
        return None


def median(values: list[float]) -> float:
    if not values:
        return 0.0
    return float(statistics.median(values))


def extract_numbers(text: str) -> list[str]:
    return re.findall(r"\d+(?:\.\d+)*", to_halfwidth_ascii(text))


def extract_citations(text: str) -> list[str]:
    return re.findall(r"\[\d+\]", text)


def has_abnormal_repetition(text: str) -> bool:
    compact = "".join(text.split())
    if re.search(r"(.)\1{7,}", compact):
        return True
    if re.search(r"(.{8,})\1{2,}", compact):
        return True
    return False


def count_ja_sentences(text: str) -> int:
    parts = [p for p in re.split(r"[。！？]+", text.strip()) if p.strip()]
    return max(len(parts), 1 if text.strip() else 0)


def quality_flags(source: str, translation: str, output_tokens: int, max_new: int) -> dict[str, Any]:
    src_chunks = split_for_translation(source)
    trans = (translation or "").strip()
    numbers_src = extract_numbers(source)
    numbers_out = extract_numbers(trans)
    missing_numbers = [n for n in numbers_src if n not in numbers_out]
    cites_src = extract_citations(source)
    cites_out = extract_citations(trans)
    missing_cites = [c for c in cites_src if c not in cites_out]
    ratio = (len(trans) / len(source)) if source else 0.0
    empty = not trans
    extremely_short = (not empty) and len(source) >= 80 and ratio < 0.15
    early_eos = output_tokens >= max(max_new - 1, 1) and len(source) >= 40
    return {
        "source_sentence_count": len(src_chunks),
        "translation_sentence_count": count_ja_sentences(trans),
        "output_length_ratio": round(ratio, 3),
        "missing_numbers": missing_numbers,
        "missing_citations": missing_cites,
        "abnormal_repetition": has_abnormal_repetition(trans),
        "empty_output": empty,
        "extremely_short_output": extremely_short,
        "early_eos_suspected": early_eos,
    }


def summarize_runs(runs: list[dict[str, Any]]) -> dict[str, Any]:
    warm = [r for r in runs if r.get("phase", "").startswith("warm")]
    walls = [float(r["wall_s"]) for r in warm]
    tps = [float(r["tokens_per_sec"]) for r in warm]
    cps = [float(r["chars_per_sec"]) for r in warm]
    chosen = sorted(warm, key=lambda r: r["wall_s"])[len(warm) // 2] if warm else runs[-1]
    return {
        "warm_wall_s_median": median(walls),
        "warm_tokens_per_sec_median": median(tps),
        "warm_chars_per_sec_median": median(cps),
        "warm_translation": chosen.get("translation", ""),
        "warm_output_tokens": chosen.get("output_tokens"),
        "warm_input_tokens": chosen.get("input_tokens"),
    }


def dump_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {path}", flush=True)
