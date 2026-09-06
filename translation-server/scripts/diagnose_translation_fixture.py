"""Minimal, single-process diagnosis for the OzCHI author-year citation fixture.

This intentionally bypasses PDF extraction. It compares production direct and
micro-batch calls with controlled raw decode inputs, then writes the exact
inputs/outputs to benchmarks/translation-fixture-diagnosis.json.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import torch

from engines.citation_protect import protect_citations, restore_citations
from engines.madlad_mps import MADLADEngine
from engines.micro_batcher import MicroBatchScheduler

SOURCE = (
    "The closest related work on finger specific interaction has been presented by "
    "(Sigure & Koseki, 1998; Marquardt et al., 2011; Benko et al, 2009), "
    "however none are in the mobile domain."
)
AUTHOR_YEAR_GROUP = (
    "(Sigure & Koseki, 1998; Marquardt et al., 2011; Benko et al, 2009)"
)
OUT = ROOT / "benchmarks" / "translation-fixture-diagnosis.json"


def generate(engine: MADLADEngine, model_input: str) -> dict[str, object]:
    """Run one greedy decode and retain pre/post-processing evidence."""
    inputs = engine._encode_translation_inputs(model_input, "ja")
    input_tokens = int(inputs["attention_mask"].sum().item())
    max_new_tokens = min(max(input_tokens * 3 + 24, 48), 256)
    with torch.inference_mode():
        outputs = engine._model.generate(
            input_ids=inputs["input_ids"],
            attention_mask=inputs["attention_mask"],
            max_new_tokens=max_new_tokens,
            num_beams=1,
            do_sample=False,
            decoder_start_token_id=engine._model.config.decoder_start_token_id,
            pad_token_id=engine._tokenizer.pad_token_id,
            eos_token_id=engine._tokenizer.eos_token_id,
        )
    raw = engine._tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
    pad = engine._tokenizer.pad_token_id
    output_tokens = int(outputs.shape[1]) if pad is None else int((outputs[0] != pad).sum().item())
    return {
        "model_input": model_input,
        "raw_decode": raw,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "max_new_tokens": max_new_tokens,
    }


def restore_atomic(text: str) -> str:
    return text.replace("ZZREF1ZZ", AUTHOR_YEAR_GROUP).replace("ＺＺＲＥＦ１ＺＺ", AUTHOR_YEAR_GROUP)


def record_manual(name: str, engine: MADLADEngine, model_input: str, restore=None, chunks=None) -> dict[str, object]:
    row = {"condition": name, "chunks": chunks or [model_input]}
    row.update(generate(engine, model_input))
    row["postprocess_output"] = restore(row["raw_decode"]) if restore else row["raw_decode"]
    return row


def main() -> None:
    engine = MADLADEngine()
    engine.load_model()
    rows: list[dict[str, object]] = []

    # A: exact public direct production API.
    protected, citations, nonce = protect_citations(SOURCE)
    direct = engine.translate(SOURCE, "en", "ja")
    rows.append({
        "condition": "A_direct_MADLADEngine_translate",
        "chunks": [SOURCE],
        "model_input": protected,
        "raw_decode": None,
        "postprocess_output": direct.text,
        "input_tokens": direct.input_tokens,
        "output_tokens": direct.output_tokens,
        "model_version": direct.model_version,
    })

    # B: exact MicroBatchScheduler path with one request.
    scheduler = MicroBatchScheduler(engine)
    micro = scheduler.translate(SOURCE, "en", "ja")
    rows.append({
        "condition": "B_MicroBatchScheduler",
        "chunks": MADLADEngine._split_for_translation(SOURCE),
        "model_input": protected,
        "raw_decode": None,
        "postprocess_output": micro.text,
        "input_tokens": micro.input_tokens,
        "output_tokens": micro.output_tokens,
        "model_version": micro.model_version,
    })

    # C/D isolate protection before any join or quality guard.
    rows.append(record_manual("C_no_scientific_or_citation_protection", engine, SOURCE))
    rows.append(record_manual(
        "D_production_scientific_citation_protection", engine, protected,
        restore=lambda text: restore_citations(text, citations, nonce),
    ))

    # E: experiment only; author-year parenthetical group becomes one atomic token.
    atomic_input = SOURCE.replace(AUTHOR_YEAR_GROUP, "ZZREF1ZZ")
    rows.append(record_manual(
        "E_atomic_author_year_citation_group", engine, atomic_input, restore=restore_atomic,
    ))

    # F: explicitly show the whole sentence as the sole model input.
    rows.append(record_manual(
        "F_whole_sentence_one_chunk", engine, protected,
        restore=lambda text: restore_citations(text, citations, nonce), chunks=[SOURCE],
    ))

    # G: a controlled, meaningful clause boundary; not a PDF/block boundary.
    left, right = SOURCE.split(", however ", maxsplit=1)
    safe_chunks = [left + ",", "However " + right]
    safe_rows = []
    for chunk in safe_chunks:
        p, c, n = protect_citations(chunk)
        one = generate(engine, p)
        one["postprocess_output"] = restore_citations(one["raw_decode"], c, n)
        safe_rows.append(one)
    rows.append({
        "condition": "G_safe_meaning_boundary_two_chunks",
        "chunks": safe_chunks,
        "model_input": [one["model_input"] for one in safe_rows],
        "raw_decode": [one["raw_decode"] for one in safe_rows],
        "postprocess_output": MADLADEngine._join_translated_chunks(
            safe_chunks, [str(one["postprocess_output"]) for one in safe_rows], "ja"
        ),
        "input_tokens": sum(int(one["input_tokens"]) for one in safe_rows),
        "output_tokens": sum(int(one["output_tokens"]) for one in safe_rows),
        "per_chunk": safe_rows,
    })

    # Greedy reproducibility control: repeat a raw whole-sentence decode.
    repeat = generate(engine, SOURCE)
    rows.append({
        "condition": "reproducibility_control_C_repeat",
        "chunks": [SOURCE],
        **repeat,
        "postprocess_output": repeat["raw_decode"],
    })

    result = {
        "fixture": SOURCE,
        "model": engine.MODEL_ID,
        "model_version": engine.MODEL_VERSION,
        "generation": {"num_beams": 1, "do_sample": False},
        "rows": rows,
    }
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(OUT)
    for row in rows:
        print(f"{row['condition']}: {row['postprocess_output']}")


if __name__ == "__main__":
    main()
