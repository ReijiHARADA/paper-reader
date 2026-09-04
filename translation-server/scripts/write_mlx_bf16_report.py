#!/usr/bin/env python3
"""Write MLX_BF16_BENCH_REPORT.md from MPS and MLX JSON results."""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "MLX_BF16_BENCH_REPORT.md"


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def bytes_gb(value: int | None) -> str:
    if not value:
        return "n/a"
    return f"{value / (1024**3):.2f} GiB"


def quality_label(mps_case: dict, mlx_case: dict) -> tuple[str, list[str]]:
    notes: list[str] = []
    mps_t = (mps_case.get("warm_translation") or "").strip()
    mlx_t = (mlx_case.get("warm_translation") or "").strip()
    mq = mlx_case.get("quality") or {}
    if not mlx_t:
        return "fail", ["empty MLX output"]
    if mq.get("early_eos_suspected") or mq.get("extremely_short_output"):
        notes.append("possible truncation")
    if mq.get("missing_citations"):
        notes.append(f"missing citations {mq['missing_citations']}")
    if mq.get("missing_numbers"):
        notes.append(f"missing numbers {mq['missing_numbers']}")
    if mq.get("abnormal_repetition"):
        notes.append("repetition")
    if mps_t == mlx_t:
        label = "same"
    else:
        # Rough overlap on Japanese character set
        mps_chars = set(mps_t)
        mlx_chars = set(mlx_t)
        overlap = len(mps_chars & mlx_chars) / max(len(mps_chars | mlx_chars), 1)
        if mq.get("early_eos_suspected") or mq.get("extremely_short_output"):
            label = "drop"
        elif overlap >= 0.45 and abs(len(mlx_t) - len(mps_t)) / max(len(mps_t), 1) < 0.35:
            label = "close"
        else:
            label = "different"
    if notes:
        label = f"{label}; {', '.join(notes)}"
    return label, notes


def go_nogo(rows: list[dict], quality_ok: bool, impl_cost: str) -> str:
    speedups = [r["speedup"] for r in rows if r["speedup"]]
    avg = statistics.mean(speedups) if speedups else 0.0
    longish = [r for r in rows if r["id"] in {"abstract", "intro", "long"}]
    long_avg = statistics.mean([r["speedup"] for r in longish]) if longish else 0.0
    if not quality_ok:
        return "No-Go"
    if avg < 1.2:
        return "No-Go"
    if impl_cost == "very high":
        return "No-Go"
    if quality_ok and avg >= 1.7:
        return "Strong Go"
    if quality_ok and avg >= 1.4 and long_avg >= 1.4:
        return "Go"
    if quality_ok and avg >= 1.4:
        return "Go (long-text below 1.4x — check before production)"
    return "No-Go (speedup below 1.4x average)"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mps", type=Path, default=ROOT / "benchmarks" / "mps-bf16-baseline.json")
    parser.add_argument("--mlx", type=Path, default=ROOT / "benchmarks" / "mlx-bf16.json")
    parser.add_argument("--conversion", type=Path, default=ROOT / "benchmarks" / "mlx-bf16-conversion.json")
    args = parser.parse_args()
    mps = load(args.mps)
    mlx = load(args.mlx)
    conversion = load(args.conversion) if args.conversion.exists() else {}

    mps_by = {c["id"]: c for c in mps["cases"]}
    mlx_by = {c["id"]: c for c in mlx["cases"]}
    rows = []
    for case_id in [c["id"] for c in mps["cases"]]:
        a = mps_by[case_id]
        b = mlx_by[case_id]
        sa = a["warm_wall_s_median"]
        sb = b["warm_wall_s_median"]
        speedup = (sa / sb) if sb else 0.0
        label, _ = quality_label(a, b)
        rows.append(
            {
                "id": case_id,
                "name": a["name"],
                "mps": sa,
                "mlx": sb,
                "speedup": speedup,
                "quality": label,
                "mps_ja": a["warm_translation"],
                "mlx_ja": b["warm_translation"],
                "mps_q": a.get("quality") or {},
                "mlx_q": b.get("quality") or {},
            }
        )

    speedups = [r["speedup"] for r in rows]
    avg = statistics.mean(speedups)
    med = statistics.median(speedups)
    long_rows = [r for r in rows if r["id"] in {"abstract", "intro", "long"}]
    long_avg = statistics.mean([r["speedup"] for r in long_rows]) if long_rows else 0.0

    drop_ids = [r["id"] for r in rows if r["quality"].startswith("drop") or "truncation" in r["quality"] or "fail" in r["quality"]]
    quality_ok = not drop_ids
    verdict = go_nogo(rows, quality_ok, impl_cost="moderate")

    lines: list[str] = []
    lines.append("# MADLAD MLX bfloat16 比較（STEP 0 / STEP 1）")
    lines.append("")
    lines.append("本番経路は **PyTorch MPS bfloat16 のまま**。この文書は独立ベンチの実測だけをまとめる。")
    lines.append("")
    lines.append("## 条件")
    lines.append("")
    lines.append("| 項目 | MPS bf16 | MLX bf16 |")
    lines.append("|---|---|---|")
    lines.append(f"| モデル | `{mps.get('model')}` | `{mlx.get('model')}` |")
    lines.append(f"| device | `{mps.get('device')}` | `{mlx.get('device')}` |")
    lines.append(f"| dtype | `{mps.get('dtype')}` | `{mlx.get('dtype')}` |")
    lines.append(f"| 文分割 | 本番と同じ | 同じ関数 |")
    lines.append(f"| batch | {mps.get('batch_size')} | {mlx.get('batch_size')}（chunk 逐次） |")
    lines.append("| generate | greedy / `max_new_tokens=min(input*3+24, 256)` | 同じ上限・greedy argmax |")
    lines.append("| tokenizer | `google/madlad400-3b-mt` `use_fast=False` | 同じ |")
    lines.append("")
    if conversion:
        lines.append("## 変換")
        lines.append("")
        lines.append(f"- ソース: `{conversion.get('source_model')}`")
        lines.append(f"- dtype: `{conversion.get('weight_dtype')}`（量子化なし）")
        lines.append(f"- サイズ: {conversion.get('weight_gib')} GiB")
        lines.append(f"- 変換時間: {conversion.get('conversion_s', 0):.1f}s")
        lines.append(f"- embedding: {conversion.get('embedding_mapping')}")
        lines.append("")
    lines.append("## 速度（warm run median）")
    lines.append("")
    lines.append("| Case | MPS bf16 | MLX bf16 | Speedup | Quality |")
    lines.append("|------|----------|----------|---------|---------|")
    for row in rows:
        lines.append(
            f"| {row['id']} | {row['mps']:.3f}s | {row['mlx']:.3f}s | {row['speedup']:.2f}× | {row['quality']} |"
        )
    lines.append("")
    lines.append(f"- 平均 speedup: **{avg:.2f}×**")
    lines.append(f"- median speedup: **{med:.2f}×**")
    lines.append(f"- long-text (abstract/intro/long) 平均: **{long_avg:.2f}×**")
    lines.append(f"- model load: MPS {mps.get('model_load_s', 0):.2f}s / MLX {mlx.get('model_load_s', 0):.2f}s")
    lines.append(
        f"- memory: MPS RSS {bytes_gb((mps.get('peak_memory') or {}).get('rss_bytes'))} "
        f"/ driver {bytes_gb((mps.get('peak_memory') or {}).get('mps_driver_allocated_bytes'))}; "
        f"MLX RSS {bytes_gb((mlx.get('peak_memory') or {}).get('rss_bytes'))} "
        f"/ peak {bytes_gb((mlx.get('peak_memory') or {}).get('mlx_peak_bytes'))}"
    )
    lines.append("")
    lines.append("比較に使った時間は cold run を除いた warm1–3 の中央値。")
    lines.append("")
    lines.append("## 訳文比較")
    lines.append("")
    for row in rows:
        lines.append(f"### {row['id']} — {row['name']}")
        lines.append("")
        lines.append("MPS:")
        lines.append("")
        lines.append(f"> {row['mps_ja']}")
        lines.append("")
        lines.append("MLX:")
        lines.append("")
        lines.append(f"> {row['mlx_ja']}")
        lines.append("")
        q = row["mlx_q"]
        lines.append(
            f"- 文数 source/MLX: {q.get('source_sentence_count')}/{q.get('translation_sentence_count')} "
            f"/ 長さ比 {q.get('output_length_ratio')} "
            f"/ 欠落数字 {q.get('missing_numbers')} "
            f"/ 欠落引用 {q.get('missing_citations')} "
            f"/ early EOS 疑い {q.get('early_eos_suspected')}"
        )
        lines.append("")
    lines.append("## Go / No-Go")
    lines.append("")
    lines.append(f"**判定: {verdict}**")
    lines.append("")
    lines.append("基準:")
    lines.append("")
    lines.append("- Go: 品質が MPS と実用上同等、かつ平均 1.4× 以上（abstract/intro/long も 1.4× 以上を重視）")
    lines.append("- Strong Go: 品質同等かつ 1.7–2.0×")
    lines.append("- No-Go: 長文欠落 / early EOS / 品質低下 / 引用破壊 / 平均 1.2× 未満 / 保守コスト過大")
    lines.append("")
    if drop_ids:
        lines.append(f"欠落または truncation の疑い: {', '.join(drop_ids)}")
        lines.append("")
    lines.append("MLX 側は本番の文バッチ（最大 8）をまだ載せていない。速度差には runtime 差とバッチ有無の両方が含まれる。")
    lines.append("")
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {REPORT} verdict={verdict} avg={avg:.2f}x", flush=True)


if __name__ == "__main__":
    main()
