# MADLAD 速度メモ（M4 / 24GB / macOS 26）

最終更新: 2026-09-04。生データは `benchmarks/`。

本番は **同じ MADLAD-400 3B + MPS + bfloat16**。コミュニティ INT8 には切り替えない。

## いまの本番

- 文（必要なら節）に分割したあと、最大 24 文を 1 回の `generate()` に載せる
- 複数 `/translate` は MicroBatchScheduler が短い窓（25ms）で chunk を合流する。`generate()` 自体は 1 本
- リクエスト同士を Metal 上で同時 generate しない
- 無効化: `MADLAD_BATCH_SIZE=1`、`MADLAD_MICROBATCH=0`

論文のような複数文段落が主対象。1文だけのブロックはバッチしないので、以前と同じ経路。

## 2026-09-03 文バッチ（本番経路）

同一エンジンをロードしたまま、2回目の `translate()`。分割は本番と同じ。

| ケース | 文数 | 逐次 | バッチ 8 | 倍率 | 訳 |
|---|---|---|---|---|---|
| short | 1 | 1.12s | 1.51s | 0.74× | 一致。1文なのでバッチ未使用。ばらつき |
| Walkman | 1 | 1.47s | 1.61s | 0.91× | 一致。同上 |
| intro（6文） | 6 | 11.14s | **3.35s** | **3.3×** | 全文残る。言い回しが2箇所だけ違う |
| title | 2 | 0.86s | 0.58s | 1.5× | 一致 |

同じ intro を続けて測ったときの壁時計（ウォーム後）:

| 設定 | 時間 | 逐次比 | 逐次と同一文か |
|---|---|---|---|
| 逐次 (`batch=1`) | 9.45s | 1.0× | 基準 |
| バッチ 4 | 4.06s | 2.3× | 違う（バッチ 8 と同じ訳） |
| バッチ 8 | 2.75s | 3.4× | 違う（バッチ 4 と同じ訳） |

バッチ 4 と 8 で訳は同じなので、速さのためにデフォルトは 8。

intro で変わった箇所（意味は残る。INT8 のような文落ちではない）:

- `デバイスはウォークマン` → `デバイスがウォークマン`
- `小型の電子機器が登場した` → `小型化が進んでいる`

1文に戻すと逐次と同じ訳。パディング付きバッチの bf16 数値差。

## 2026-09-03 単発 generate（分割なし）

分割前の生 `generate()`。2回目。`/tmp/madlad-mps-bench.json`。

| ケース | 時間 | tok/s | 訳の要約 |
|---|---|---|---|
| short | 1.28s | 20.3 | 神経機械翻訳のためのトランスフォーマアーキテクチャを紹介した。 |
| Walkman | 1.49s | 22.9 | 従来は静止したデバイスはウォークマンや… |
| intro 一発 | 10.46s | 22.6 | 6文ほぼ全部。236 tok |
| title | 0.84s | 23.8 | インタラクティブジュエリー: デザインの探求 |

## 2026-09-03 MLX INT8（不採用）

重み: `aufklarer/MADLAD400-3B-MT-MLX` の int8。mlx-examples 系 T5 + `gated-gelu`。`/tmp/madlad-mlx-int8-bench.json`。

| ケース | MPS bf16 | MLX INT8 | 備考 |
|---|---|---|---|
| short | 1.28s / 20.3 tok/s | 0.70s / 34.5 tok/s | 訳は一致。約 1.8× |
| Walkman | 1.49s / 22.9 | 0.95s / 33.7 | 訳は一致。約 1.6× |
| intro | 10.46s / 22.6 | 3.76s / 22.6 | 壁時計は速いが 85 tok で停止。後半欠落 |
| title | 0.84s / 23.8 | 0.29s / 31.4 | `デザインの探求` が落ちる |

KV キャッシュの有無で title は同じ。実装バグではなく量子化の早期 EOS。

論文読みでは不採用。ロード約 1.6s（キャッシュ済み 3.3GB）。

## 2026-09-03 昼: dtype / CPU（旧レポート）

入力は short 文。当時は `max_new_tokens=512` で EOS を逃すと 513 tok まで走った。

| 設定 | 時間 | 出力 tok | tok/s |
|---|---|---|---|
| CPU fp32 | 67.57s | 513 | 7.59 |
| **MPS bfloat16** | **3.16s** | **71** | **22.44** |
| MPS float16 | 27.67s | 513 | 18.54 |
| MPS float32 | 51.30s | 513 | 10.00 |

詳細は `MPS_OPTIMIZATION_REPORT.md`。bf16 以外は EOS 未発火。現行の上限は `min(input*3+24, 256)`。

## 判断ログ

1. CPU 固定はしない。MPS + bf16 が安定かつ速い。
2. コミュニティ MLX INT8 は短文だけ速く、段落で欠ける。使わない。
3. 小さい NLLB / OPUS は未測。学術日本語を落とすリスクがあるので、2倍目的では後回し。
4. 文分割は維持（3B greedy の drift 対策）。まとめるのは呼び出しだけ。
5. 公式 3B の MLX bf16 は品質同等だが本番 batch より遅い（No-Go）。詳細は `MLX_BF16_BENCH_REPORT.md`。
6. 全文 2 倍は micro-batching で到達。詳細は `MPS_BATCH_OPTIMIZATION_REPORT.md`。

## 2026-09-04 MLX bf16（STEP 0/1、本番未切替）

詳細は [MLX_BF16_BENCH_REPORT.md](./MLX_BF16_BENCH_REPORT.md)。公式 `google/madlad400-3b-mt` を量子化なし bf16 で MLX 実行。

- 品質: INT8 で落ちたタイトル後半・長段落途中停止は再発しない。MPS と実用上同等
- 速度: 逐次同士は約 1.10×（どちらも ~21 tok/s）。現行本番の文バッチ 8 対比では平均 0.68×
- 判定: **No-Go**。runtime 差し替えだけでは 1.5〜2 倍にならない

```bash
PYTORCH_ENABLE_MPS_FALLBACK=1 .venv/bin/python scripts/bench_mps_baseline.py --sequential
.venv/bin/python scripts/convert_madlad_mlx_bf16.py
.venv-mlx-bf16/bin/python scripts/bench_mlx_bf16.py
```

## 再現

```bash
# 逐次 vs バッチ（本番 translate 経路）
cd translation-server
# 先に本番サーバーを止める（24GB でモデル二重ロードを避ける）
PYTORCH_ENABLE_MPS_FALLBACK=1 .venv/bin/python scripts/bench_mps_batch.py

# MLX INT8（別 venv。本番サーバーを止める）
.venv-mlx/bin/python scripts/bench_mlx_int8.py
```
