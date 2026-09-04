# MADLAD MPS バッチ最適化（STEP 2）

本番は **PyTorch MPS bfloat16 + MADLAD-400 3B** のまま。MLX / 量子化は使っていない。`generate()` の並列実行もしていない。

環境: M4 / 24GB / macOS 26.0。測定日: 2026-09-04。固定入力: `benchmarks/corpus.json`。

生データ:

- `benchmarks/mps-batch-sweep.json`
- `benchmarks/mps-length-buckets.json`
- `benchmarks/mps-microbatch.json`
- `benchmarks/mps-token-budget.json`
- `benchmarks/mps-step2-e2e.json`

再現:

```bash
cd translation-server
# 本番サーバーを止める
PYTORCH_ENABLE_MPS_FALLBACK=1 .venv/bin/python scripts/bench_mps_step2.py
```

---

## 1. 現行 baseline

比較基準は **段落ごとに訳す現行 production**（文バッチ 8、段落間は合流しない）。

| Case | wall (warm median) |
|------|-------------------:|
| short | 1.35s |
| title | 0.60s |
| abstract | 3.57s |
| intro | 3.29s |
| long | 6.54s |

単文 generate はこれまでどおり約 20–22 tok/s。今回速くなるのは tok/s ではなく、**padding・小さい batch・generate 回数**。

引用番号 `[8]` `[12]` `[3]` は最適化の前後どちらでも落ちる（MADLAD greedy）。欠落が増えたケースはない。

---

## 2. Batch size sweep（STEP 2-A）

| batch | abstract | intro | long | memory | quality vs 8 |
|------:|---------:|------:|-----:|--------:|--------------|
| 1 | 6.49s | 16.09s | 33.18s | 安定 | — |
| 2 | 4.53s | 9.29s | 17.02s | 安定 | — |
| 4 | 4.06s | 6.44s | 13.08s | 安定 | — |
| 8 | 3.57s | 3.29s | 6.54s | 安定 | baseline / same |
| 12 | 3.12s | 3.18s | 6.41s | 安定 | same |
| 16 | 3.13s | 3.13s | 8.12s | 安定 | same（long がばらついた） |
| 24 | 3.16s | 3.14s | 5.84s | 安定 | same |
| 32 | 2.96s | 3.13s | 6.13s | 安定 | same |

OOM / Metal error / SIGSEGV は 32 までなし。intro の padding は batch 24 で約 32%、long で約 36%。

---

## 3. 最適 batch size

長文 3 本の合計:

- batch 8: 13.40s
- batch 24: 12.14s（約 **1.10×**）
- batch 32: 12.22s

**採用: 24。** 品質は batch 8 と同一。単一段落だけでは 1.3× に届かない。本番 default を 8 → 24 に変更した（`MADLAD_BATCH_SIZE` で上書き可）。

---

## 4–5. Length bucketing と padding

batch 24 のまま、長さ bucket（≤32 / 33–64 / 65–128 / 129–512）を入れた。

| Case | なし | bucket | padding | quality |
|------|-----:|-------:|---------|---------|
| abstract | 2.90s | 4.21s | 0.12 → 0.04 | close |
| intro | 3.10s | 4.65s | 0.32 → 0.11 | same |
| long | 5.80s | 5.48s | 0.36 → 0.29 | same |

padding は減るが、**generate 回数が増えて長文系が遅くなる**。**不採用。**

---

## 6–7. Micro-batching と generate 回数

複数段落の独立 chunk を 1 回の `generate()` に載せる（並列 generate ではない）。

| N paras | 現行（段落ごと） | coalesced | Speedup | generate 回数 |
|--------:|-----------------:|----------:|--------:|--------------:|
| 10 | 23.94s / 10 calls | 12.55s / 2 | **1.91×** | 10 → 2 |
| 25 | 69.15s / 25 calls | 29.50s / 4 | **2.34×** | 25 → 4 |
| 50 | 133.80s / 50 calls | 53.15s / 7 | **2.52×** | 50 → 7 |

occupancy は 0.12–0.14 → 0.62–0.98。確認走査（2-E）でも 50 段落 59.8s / 7 calls。

品質: same または close（「は／が」程度）。文欠落・early EOS なし。引用欠落の増加なし。

単一段落の wait window（intro）:

| window | 合計 |
|-------:|-----:|
| 0ms | 3.17s |
| 25ms | 3.02s |
| 50ms | 3.03s |
| 100ms | 3.09s |

25ms の待ちは 3s の generate に対して無視できる。本番は **25ms**。

---

## 8. Dynamic token budget

max batch 24 のうえに `padded tokens <= X` を足した（25 段落）。

| budget | intro | 25 paras | calls |
|--------|------:|---------:|------:|
| none | 3.00s | 27.26s | 4 |
| 512 | 3.14s | 36.75s | 9 |
| 1024 | 2.94s | 31.50s | 5 |
| 2048 | 2.97s | 27.08s | 4 |
| 4096 | 3.02s | 27.38s | 4 |

512/1024 は呼び出しが増えて遅くなる。2048 は none と同等。**追加の token budget は不採用**（max 24 で十分）。

---

## 9. Single paragraph latency

| Case | 現行 batch 8 | 最終（batch 24） | 変化 |
|------|-------------:|-----------------:|-----:|
| intro | 3.29s | 3.04s | −8% |
| long | 6.54s | 5.47s | −16% |
| abstract | 3.57s | 2.88s | −19% |

悪化していない。25ms window を足しても intro は約 3.0s。

---

## 10. Whole-paper throughput

現行 = 段落を 1 つずつ `/translate`（キュー concurrency 1）。

| | 25 paras | 50 paras | 段落/s |
|--|--------:|--------:|-------:|
| Current batch 8, 段落ごと | 69.2s | 133.8s | 0.37 |
| + batch 24 + micro-batch | 27.6–29.5s | 53.2–59.8s | 0.84–0.94 |
| Speedup | **2.3–2.5×** | **2.2–2.5×** | |

---

## 11. Memory

- スイープ中: MPS allocated 約 5.5 GiB、driver 最大約 7.9 GiB
- 24GB 内。OOM なし

---

## 12. 品質差

- batch 12/24/32 の訳は batch 8 と同一（今回の corpus）
- micro-batch は一部 close（padding 由来の bf16 差）。欠落なし
- 引用番号欠落は MADLAD 本体。最適化で増えていない

---

## 13. MPS crash / OOM

なし（batch 32、50 段落 coalesced まで）。

---

## 14. Production 採用構成

```text
PyTorch MPS bfloat16
MADLAD-400 3B
MADLAD_BATCH_SIZE=24
MicroBatchScheduler（window 25ms）
generate() は常に 1 本
length bucketing なし
token budget なし
フロントの翻訳並列数 default 8（HTTP を積むだけ。Metal 並列ではない）
```

無効化: `MADLAD_MICROBATCH=0`、`MADLAD_BATCH_SIZE=8`。

---

## 15. 総合 speedup

| Config | Single latency (intro) | 25 paras | 50 paras | Throughput | Speedup |
|--------|-----------------------:|---------:|---------:|-----------:|--------:|
| Current batch 8 | 3.29s | 69.2s | 133.8s | 0.37 para/s | 1.00× |
| Best batch 24 | 3.14s | （単段のみ） | — | — | 長文 ~1.10× |
| + bucketing | 4.65s | — | — | — | No-Go |
| + micro batch | 3.04s | 27.6–29.5s | 53–60s | 0.84–0.94 para/s | **2.2–2.5×** |
| + dynamic budget | 3.00s | 27.3s | — | 同等 | 採用せず |

**判定: Strong Go**（全文 throughput ≥ 1.5×、単段 latency 悪化なし、品質同等、安定）。

---

## 16. M4 / 24GB のまま 2 倍に届いたか

**単一段落: No。** tok/s は約 21 のまま。batch 24 でも intro は約 1.1×。

**論文全体の throughput: Yes。** 25–50 段落で **2.2–2.5×**。generate 回数削減が効いている。

総合の問い「現行 production 比 2 倍は現実的か」:

**Possibly — 正確には、単段 No / 全文 Yes。**

STEP 2 の目的は全文 end-to-end なので、**全文については 2 倍は出た**。これ以上の複雑な最適化は、同じ 3B bf16 では収穫が薄い。
