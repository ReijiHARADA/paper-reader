#!/usr/bin/env python3
"""STEP 2 MPS batching experiments. Does not change production server.py."""

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
    dump_json,
    extract_citations,
    host_info,
    load_corpus,
    quality_flags,
    rss_bytes,
    split_for_translation,
)
from engines.madlad_mps import MADLADEngine  # noqa: E402
from experimental_mps_batch import (  # noqa: E402
    ExperimentalTranslator,
    timed_paragraph,
    timed_paragraphs,
)

BENCH = ROOT / "benchmarks"
FOCUS = ("abstract", "intro", "long")
SWEEP = (1, 2, 4, 8, 12, 16, 24, 32)
WINDOWS_MS = (0, 10, 25, 50, 100)
TOKEN_BUDGETS = (512, 1024, 2048, 4096)


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


def configure(
    translator: ExperimentalTranslator,
    *,
    batch_size: int,
    buckets: bool = False,
    token_budget: int | None = None,
) -> None:
    translator.max_batch_size = batch_size
    translator.use_buckets = buckets
    translator.token_budget = token_budget


def median_wall(runs: list[dict]) -> float:
    walls = sorted(float(r["wall_s"]) for r in runs)
    return walls[len(walls) // 2]


def run_case(translator: ExperimentalTranslator, text: str, timed: int = 2) -> dict:
    timed_paragraph(translator, text)  # warmup / compile
    runs = []
    for i in range(timed):
        measured = timed_paragraph(translator, text)
        measured["phase"] = f"warm{i+1}"
        measured["memory"] = mps_memory()
        runs.append(measured)
    chosen = sorted(runs, key=lambda r: r["wall_s"])[len(runs) // 2]
    flags = quality_flags(text, chosen["translation"], chosen["output_tokens"], 256)
    return {
        "warm_wall_s_median": median_wall(runs),
        "warm_tokens_per_sec_median": sorted(r["tokens_per_sec"] for r in runs)[len(runs) // 2],
        "translation": chosen["translation"],
        "input_tokens": chosen["input_tokens"],
        "output_tokens": chosen["output_tokens"],
        "output_chars": chosen["output_chars"],
        "stats": chosen["stats"],
        "quality": flags,
        "citation_count": len(extract_citations(chosen["translation"])),
        "source_citation_count": len(extract_citations(text)),
        "memory": chosen["memory"],
        "runs": [
            {k: v for k, v in r.items() if k != "translation"}
            for r in runs
        ],
    }


def make_paper(corpus: dict, n: int) -> list[str]:
    base = [case["text"] for case in corpus["cases"]]
    return [base[i % len(base)] for i in range(n)]


def quality_vs(baseline: str, candidate: str, source: str) -> str:
    if candidate == baseline:
        return "same"
    b_flags = quality_flags(source, baseline, 0, 256)
    c_flags = quality_flags(source, candidate, 0, 256)
    if c_flags["empty_output"] or c_flags["extremely_short_output"] or c_flags["abnormal_repetition"]:
        return "drop"
    extra_cites = len(c_flags["missing_citations"]) - len(b_flags["missing_citations"])
    if extra_cites > 0:
        return "more_citation_loss"
    ratio = abs(len(candidate) - len(baseline)) / max(len(baseline), 1)
    if ratio < 0.35:
        return "close"
    return "different"


def step_2a(translator: ExperimentalTranslator, corpus: dict) -> dict:
    print("\n===== STEP 2-A batch size sweep =====", flush=True)
    by_batch: dict[str, dict] = {}
    baseline8: dict[str, str] = {}
    for batch in SWEEP:
        print(f"\n--- batch={batch} ---", flush=True)
        configure(translator, batch_size=batch)
        cases_out = {}
        crashed = None
        try:
            for case in corpus["cases"]:
                print(f"  {case['id']}", flush=True)
                cases_out[case["id"]] = run_case(translator, case["text"])
                print(
                    f"    {cases_out[case['id']]['warm_wall_s_median']:.3f}s "
                    f"calls={cases_out[case['id']]['stats']['generate_calls']} "
                    f"pad={cases_out[case['id']]['stats']['average_padding_ratio']:.2f}",
                    flush=True,
                )
            if batch == 8:
                baseline8 = {cid: row["translation"] for cid, row in cases_out.items()}
        except Exception as exc:
            crashed = repr(exc)
            print(f"  FAILED batch={batch}: {crashed}", flush=True)
        payload = {
            "batch_size": batch,
            "cases": cases_out,
            "error": crashed,
            "memory": mps_memory(),
        }
        if baseline8:
            payload["quality_vs_batch8"] = {
                cid: quality_vs(baseline8[cid], row["translation"], next(c["text"] for c in corpus["cases"] if c["id"] == cid))
                for cid, row in cases_out.items()
            }
        by_batch[str(batch)] = payload
        dump_json(BENCH / "mps-batch-sweep.json", {"engine": "pytorch-mps-bf16", "batches": by_batch, "host": host_info()})
        if crashed:
            break
    return {"batches": by_batch, "baseline8": baseline8}


def step_2b(translator: ExperimentalTranslator, corpus: dict, batch_size: int, baseline8: dict[str, str]) -> dict:
    print("\n===== STEP 2-B length bucketing =====", flush=True)
    configure(translator, batch_size=batch_size, buckets=False)
    off = {}
    on = {}
    for case in corpus["cases"]:
        print(f"  no-bucket {case['id']}", flush=True)
        off[case["id"]] = run_case(translator, case["text"])
    configure(translator, batch_size=batch_size, buckets=True)
    for case in corpus["cases"]:
        print(f"  bucket {case['id']}", flush=True)
        on[case["id"]] = run_case(translator, case["text"])
    compare = {}
    for case in corpus["cases"]:
        cid = case["id"]
        compare[cid] = {
            "off_s": off[cid]["warm_wall_s_median"],
            "on_s": on[cid]["warm_wall_s_median"],
            "speedup": (off[cid]["warm_wall_s_median"] / on[cid]["warm_wall_s_median"])
            if on[cid]["warm_wall_s_median"]
            else 0,
            "pad_off": off[cid]["stats"]["average_padding_ratio"],
            "pad_on": on[cid]["stats"]["average_padding_ratio"],
            "quality": quality_vs(
                baseline8.get(cid, off[cid]["translation"]),
                on[cid]["translation"],
                case["text"],
            ),
        }
    payload = {"batch_size": batch_size, "off": off, "on": on, "compare": compare}
    dump_json(BENCH / "mps-length-buckets.json", payload)
    return payload


def step_2c(
    translator: ExperimentalTranslator,
    corpus: dict,
    batch_size: int,
    buckets: bool,
) -> dict:
    print("\n===== STEP 2-C micro-batching =====", flush=True)
    configure(translator, batch_size=batch_size, buckets=buckets)
    papers = {n: make_paper(corpus, n) for n in (10, 25, 50)}

    sequential = {}
    coalesced = {}
    for n, paras in papers.items():
        print(f"  sequential {n} paras", flush=True)
        timed_paragraphs(translator, paras[:1])
        # sequential: one paragraph at a time
        t0 = time.perf_counter()
        seq_stats_calls = 0
        seq_out = []
        occupancy = []
        pad = []
        for para in paras:
            one = timed_paragraph(translator, para)
            seq_out.append(one["translation"])
            seq_stats_calls += one["stats"]["generate_calls"]
            occupancy.append(one["stats"]["average_occupancy"])
            pad.append(one["stats"]["average_padding_ratio"])
        seq_wall = time.perf_counter() - t0
        sequential[str(n)] = {
            "wall_s": seq_wall,
            "generate_calls": seq_stats_calls,
            "average_occupancy": sum(occupancy) / len(occupancy) if occupancy else 0,
            "average_padding_ratio": sum(pad) / len(pad) if pad else 0,
            "paragraphs_per_sec": n / seq_wall if seq_wall else 0,
            "chars_per_sec": sum(len(t) for t in seq_out) / seq_wall if seq_wall else 0,
            "memory": mps_memory(),
        }
        print(f"    {seq_wall:.2f}s calls={seq_stats_calls}", flush=True)

        print(f"  coalesced {n} paras", flush=True)
        timed_paragraphs(translator, paras)
        measured = timed_paragraphs(translator, paras)
        coalesced[str(n)] = {
            "wall_s": measured["wall_s"],
            "generate_calls": measured["stats"]["generate_calls"],
            "average_occupancy": measured["stats"]["average_occupancy"],
            "average_padding_ratio": measured["stats"]["average_padding_ratio"],
            "paragraphs_per_sec": measured["paragraphs_per_sec"],
            "chars_per_sec": measured["chars_per_sec"],
            "tokens_per_sec": measured["tokens_per_sec"],
            "memory": mps_memory(),
            "speedup_vs_sequential": (seq_wall / measured["wall_s"]) if measured["wall_s"] else 0,
        }
        print(
            f"    {measured['wall_s']:.2f}s calls={measured['stats']['generate_calls']} "
            f"{coalesced[str(n)]['speedup_vs_sequential']:.2f}x",
            flush=True,
        )

    unique = corpus["cases"]
    print("  quality check unique paragraphs", flush=True)
    seq_unique = [timed_paragraph(translator, c["text"])["translation"] for c in unique]
    micro_unique = timed_paragraphs(translator, [c["text"] for c in unique])
    quality = {
        c["id"]: quality_vs(seq_t, micro_t, c["text"])
        for c, seq_t, micro_t in zip(unique, seq_unique, micro_unique["translations"])
    }

    windows = {}
    intro = next(c["text"] for c in corpus["cases"] if c["id"] == "intro")
    timed_paragraph(translator, intro)
    for wait in WINDOWS_MS:
        t0 = time.perf_counter()
        if wait:
            time.sleep(wait / 1000)
        measured = timed_paragraph(translator, intro)
        wall = time.perf_counter() - t0
        windows[str(wait)] = {
            "wait_ms": wait,
            "wall_s_including_wait": wall,
            "generate_s": measured["wall_s"],
            "latency_tax_s": wall - measured["wall_s"],
        }
        print(f"  window {wait}ms intro total={wall:.3f}s gen={measured['wall_s']:.3f}s", flush=True)

    payload = {
        "batch_size": batch_size,
        "buckets": buckets,
        "sequential": sequential,
        "coalesced": coalesced,
        "quality_vs_sequential_unique": quality,
        "single_paragraph_windows": windows,
    }
    dump_json(BENCH / "mps-microbatch.json", payload)
    return payload


def step_2d(
    translator: ExperimentalTranslator,
    corpus: dict,
    batch_size: int,
    buckets: bool,
) -> dict:
    print("\n===== STEP 2-D token budget =====", flush=True)
    paras25 = make_paper(corpus, 25)
    intro = next(c["text"] for c in corpus["cases"] if c["id"] == "intro")
    long = next(c["text"] for c in corpus["cases"] if c["id"] == "long")
    results = {}
    for budget in (None, *TOKEN_BUDGETS):
        label = "none" if budget is None else str(budget)
        print(f"  budget={label}", flush=True)
        configure(translator, batch_size=batch_size, buckets=buckets, token_budget=budget)
        try:
            timed_paragraph(translator, intro)
            single = {
                "intro": run_case(translator, intro, timed=2),
                "long": run_case(translator, long, timed=2),
            }
            timed_paragraphs(translator, paras25)
            paper = timed_paragraphs(translator, paras25)
            results[label] = {
                "single": {
                    cid: {
                        "wall_s": row["warm_wall_s_median"],
                        "generate_calls": row["stats"]["generate_calls"],
                        "padding_ratio": row["stats"]["average_padding_ratio"],
                    }
                    for cid, row in single.items()
                },
                "paper25": {
                    "wall_s": paper["wall_s"],
                    "generate_calls": paper["stats"]["generate_calls"],
                    "occupancy": paper["stats"]["average_occupancy"],
                    "padding_ratio": paper["stats"]["average_padding_ratio"],
                    "paragraphs_per_sec": paper["paragraphs_per_sec"],
                },
                "memory": mps_memory(),
                "error": None,
            }
            print(
                f"    intro={single['intro']['warm_wall_s_median']:.3f}s "
                f"25p={paper['wall_s']:.2f}s calls={paper['stats']['generate_calls']}",
                flush=True,
            )
        except Exception as exc:
            results[label] = {"error": repr(exc), "memory": mps_memory()}
            print(f"    FAILED {label}: {exc!r}", flush=True)
            break
    payload = {"max_batch_size": batch_size, "buckets": buckets, "budgets": results}
    dump_json(BENCH / "mps-token-budget.json", payload)
    return payload


def step_2e(
    translator: ExperimentalTranslator,
    corpus: dict,
    *,
    baseline_batch: int,
    best_batch: int,
    use_buckets: bool,
    token_budget: int | None,
    sweep: dict,
    buckets: dict | None,
    micro_2c: dict,
    budget: dict | None,
) -> dict:
    print("\n===== STEP 2-E confirmation (final candidate vs current singles) =====", flush=True)
    configure(
        translator,
        batch_size=best_batch,
        buckets=use_buckets,
        token_budget=token_budget,
    )
    singles = {}
    for case in corpus["cases"]:
        singles[case["id"]] = run_case(translator, case["text"], timed=2)
    papers = {}
    for n in (10, 25, 50):
        paras = make_paper(corpus, n)
        timed_paragraphs(translator, paras)
        measured = timed_paragraphs(translator, paras)
        papers[str(n)] = {
            "wall_s": measured["wall_s"],
            "generate_calls": measured["stats"]["generate_calls"],
            "occupancy": measured["stats"]["average_occupancy"],
            "padding_ratio": measured["stats"]["average_padding_ratio"],
            "chars_per_sec": measured["chars_per_sec"],
            "tokens_per_sec": measured["tokens_per_sec"],
            "paragraphs_per_sec": measured["paragraphs_per_sec"],
        }
        print(f"  final {n}p {measured['wall_s']:.2f}s calls={measured['stats']['generate_calls']}", flush=True)

    payload = {
        "baseline_batch": baseline_batch,
        "best_batch": best_batch,
        "use_buckets": use_buckets,
        "token_budget": token_budget,
        "final_singles": {
            cid: {
                "wall_s": row["warm_wall_s_median"],
                "translation": row["translation"],
                "citation_count": row["citation_count"],
                "source_citation_count": row["source_citation_count"],
            }
            for cid, row in singles.items()
        },
        "final_papers": papers,
        "memory": mps_memory(),
        "sweep_ref": {
            str(k): {
                cid: v["cases"][cid]["warm_wall_s_median"]
                for cid in FOCUS
                if cid in v.get("cases", {})
            }
            for k, v in (sweep.get("batches") or {}).items()
            if v.get("cases")
        },
        "bucket_ref": (buckets or {}).get("compare"),
        "micro_ref": {
            "sequential": (micro_2c or {}).get("sequential"),
            "coalesced": (micro_2c or {}).get("coalesced"),
            "quality": (micro_2c or {}).get("quality_vs_sequential_unique"),
            "windows": (micro_2c or {}).get("single_paragraph_windows"),
        },
        "budget_ref": (budget or {}).get("budgets"),
        "host": host_info(),
    }
    dump_json(BENCH / "mps-step2-e2e.json", payload)
    return payload


def pick_best_batch(sweep: dict) -> int:
    scores = []
    for key, payload in sweep["batches"].items():
        if payload.get("error") or not payload.get("cases"):
            continue
        batch = int(key)
        focus = []
        for cid in FOCUS:
            if cid in payload["cases"]:
                focus.append(payload["cases"][cid]["warm_wall_s_median"])
        if len(focus) != 3:
            continue
        qualities = (payload.get("quality_vs_batch8") or {}).values()
        if any(q in {"drop", "more_citation_loss"} for q in qualities):
            continue
        scores.append((sum(focus), batch))
    if not scores:
        return 8
    scores.sort()
    best_sum, best_batch = scores[0]
    eight = next((s for s in scores if s[1] == 8), None)
    if eight and eight[0] <= best_sum * 1.05:
        return 8
    return best_batch


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-step", default="2a", choices=["2a", "2b", "2c", "2d", "2e"])
    args = parser.parse_args()

    corpus = load_corpus()
    engine = MADLADEngine()
    print("[STEP2] loading production MADLAD MPS bf16...", flush=True)
    engine.load_model()
    translator = ExperimentalTranslator(engine)

    sweep = None
    buckets = None
    micro = None
    budget = None

    if args.from_step <= "2a":
        sweep = step_2a(translator, corpus)
    else:
        sweep = {"batches": {}, "baseline8": {}}

    best_batch = pick_best_batch(sweep) if sweep["batches"] else 8
    baseline8 = sweep.get("baseline8") or {}
    print(f"\n[STEP2] best batch by abstract+intro+long: {best_batch}", flush=True)

    use_buckets = False
    if args.from_step <= "2b":
        buckets = step_2b(translator, corpus, best_batch, baseline8)
        focus_on = [buckets["compare"][cid]["on_s"] for cid in FOCUS]
        focus_off = [buckets["compare"][cid]["off_s"] for cid in FOCUS]
        use_buckets = sum(focus_on) < sum(focus_off) * 0.97
        drops = [cid for cid, row in buckets["compare"].items() if row["quality"] in {"drop", "more_citation_loss"}]
        if drops:
            use_buckets = False
            print(f"[STEP2] bucketing rejected for quality: {drops}", flush=True)
        print(f"[STEP2] use_buckets={use_buckets}", flush=True)

    if args.from_step <= "2c":
        micro = step_2c(translator, corpus, best_batch, use_buckets)

    chosen_budget = None
    if args.from_step <= "2d":
        budget = step_2d(translator, corpus, best_batch, use_buckets)
        # Prefer no extra latency on intro/long, better or equal 25-para time, no errors.
        ranked = []
        for label, row in (budget.get("budgets") or {}).items():
            if row.get("error"):
                continue
            intro_s = row["single"]["intro"]["wall_s"]
            paper_s = row["paper25"]["wall_s"]
            ranked.append((paper_s, intro_s, label))
        ranked.sort()
        if ranked:
            best_label = ranked[0][2]
            none = next((r for r in ranked if r[2] == "none"), None)
            if none and ranked[0][0] > none[0] * 0.97:
                chosen_budget = None
            elif best_label != "none":
                chosen_budget = int(best_label)
        print(f"[STEP2] token_budget={chosen_budget}", flush=True)

    if args.from_step <= "2e":
        step_2e(
            translator,
            corpus,
            baseline_batch=8,
            best_batch=best_batch,
            use_buckets=use_buckets,
            token_budget=chosen_budget,
            sweep=sweep,
            buckets=buckets,
            micro_2c=micro or {},
            budget=budget,
        )

    print("[STEP2] done", flush=True)
    engine.unload_model()


if __name__ == "__main__":
    main()
