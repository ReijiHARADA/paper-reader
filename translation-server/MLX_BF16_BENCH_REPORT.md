# MADLAD MLX bfloat16 比較（STEP 0 / STEP 1）

本番経路は **PyTorch MPS bfloat16 のまま**。この文書は独立ベンチの実測だけをまとめる。量子化（INT8/INT4）は使っていない。

環境: Apple Silicon M4 / 24GB / macOS 26.0。測定日: 2026-09-04。

生データ:

- `benchmarks/corpus.json` — 固定英文
- `benchmarks/mps-bf16-baseline.json`
- `benchmarks/mlx-bf16.json`
- `benchmarks/mlx-bf16-conversion.json`

再現:

```bash
# 本番サーバーを止めてから（24GB でモデル二重ロードを避ける）
cd translation-server
PYTORCH_ENABLE_MPS_FALLBACK=1 .venv/bin/python scripts/bench_mps_baseline.py --sequential
.venv/bin/python scripts/convert_madlad_mlx_bf16.py
.venv-mlx-bf16/bin/python scripts/bench_mlx_bf16.py
.venv/bin/python scripts/write_mlx_bf16_report.py
```

---

## 条件

| 項目 | MPS bf16（本番） | MLX bf16（実験） |
|---|---|---|
| モデル | `google/madlad400-3b-mt` | 同じ公式重みを bf16 変換 |
| device | `mps` | MLX Metal |
| dtype | `torch.bfloat16` | `mx.bfloat16` |
| 文分割 | 本番 `MADLADEngine._split_for_translation` | 同じ規則 |
| 結合・半角化 | 本番 | 同じ後処理 |
| tokenizer | `use_fast=False` | 同じ |
| generate | greedy、`max_new_tokens=min(max(input*3+24, 48), 256)` | 同じ上限・argmax |
| 文バッチ | **8**（本番） | **1**（chunk 逐次。今回は micro-batching しない） |
| 比較用の逐次 | 各 case の warm 後に `batch=1` を 1 回 | 本体が逐次 |

実装方式: `mlx-lm` は decoder-only 前提なので使っていない。既存の `scripts/mlx_t5.py`（mlx-examples T5 系、encoder-decoder）に **量子化なし bf16 ローダ** を足した。

変換: `scripts/convert_madlad_mlx_bf16.py`

- `decoder.embed_tokens` → `shared`（入力 embedding。`lm_head` とは結ばない）
- 全 742 tensor を `bfloat16`
- 量子化なし
- 22.8s、5.477 GiB、2.94B パラメータ

速度の主表は **cold を除いた warm1–3 の中央値**。

---

## 速度（warm median）

対 **本番 batch 8**（これが Go/No-Go の速度基準）:

| Case | MPS bf16 (batch 8) | MLX bf16 (逐次) | Speedup | Quality |
|------|----------|----------|---------|---------|
| short | 1.276s | 1.131s | 1.13× | same |
| title | 0.558s | 0.777s | 0.72× | same（後半欠落なし） |
| abstract | 3.050s | 5.614s | 0.54× | same |
| body_short | 1.613s | 1.494s | 1.08× | close（「は／が」のみ） |
| intro | 3.129s | 10.484s | 0.30× | close（文欠落なし。[8] は両者とも落ちる） |
| long | 6.750s | 25.276s | 0.27× | close（末尾まで残る） |
| citations | 2.241s | 3.440s | 0.65× | same（引用番号は両者とも欠落） |
| terms | 3.685s | 4.981s | 0.74× | close（数字・固有名詞は保持） |

- 平均 speedup（対 batch 8）: **0.68×**
- median speedup: **0.73×**
- long-text（abstract / intro / long）平均: **0.37×**

対 **同じ文分割の逐次 MPS**（runtime 差だけ）:

| Case | MPS sequential | MLX sequential | Speedup |
|------|----------------|----------------|---------|
| short | 1.296s | 1.131s | 1.15× |
| title | 0.913s | 0.777s | 1.17× |
| abstract | 5.965s | 5.614s | 1.06× |
| body_short | 1.585s | 1.494s | 1.06× |
| intro | 11.395s | 10.484s | 1.09× |
| long | 25.757s | 25.276s | 1.02× |
| citations | 3.918s | 3.440s | 1.14× |
| terms | 5.305s | 4.981s | 1.07× |

- 平均 speedup（対逐次 MPS）: **1.10×**
- median: **1.08×**
- long-text 平均: **1.06×**
- 逐次時の生成速度は両者ともおよそ **20–22 tok/s**

ロードとメモリ:

| | MPS bf16 | MLX bf16 |
|---|---|---|
| model load | 26.34s | 2.40s |
| 推論時メモリ | MPS allocated 5.49 GiB / driver 6.18 GiB | active 5.48 GiB / peak 5.57 GiB |
| 重みファイル | HF cache の fp32（実行時 bf16） | 5.477 GiB safetensors bf16 |

MLX の first-token（warm）は約 42ms。encoder は短文で約 40–55ms、長段落は chunk 数に比例。

---

## 訳文比較

### short — 短い一般文

MPS:

> 神経機械翻訳のためのトランスフォーマアーキテクチャを紹介した。

MLX:

> 神経機械翻訳のためのトランスフォーマアーキテクチャを紹介した。

同一。欠落なし。

### title — 論文タイトル

MPS / MLX とも:

> インタラクティブジュエリー: デザインの探求

以前の MLX INT8 では `デザインの探求` が落ちた。**bf16 では再現しない。**

### abstract — Abstractの1段落

3文とも同一。途中停止なし。

### body_short — 本文の短い段落

- MPS: `デバイスはウォークマン`
- MLX: `デバイスがウォークマン`

意味は同じ。INT8 当時の欠落ではない。

### intro — 6文程度のIntroduction

両者とも 6 文あり、末尾の van Dijk 文まで残る。言い回し差:

- 3文目: MPS `近年, 衣服に…` / MLX `また, 最近では, 衣服に…`
- 引用 `[8]` は **MPS も MLX も訳に出ない**（モデルの greedy 特性。runtime 差ではない）

INT8 で起きた「85 tok で停止して後半欠落」は **再発していない**（MLX 224 tok / MPS 232 tok）。

### long — かなり長い段落

10文とも末尾（バッテリー寿命）まで残る。差は `これらの／それらの`、`小型化された／小型化した` 程度。early EOS ではない。

### citations — 引用番号を含む文章

訳文は同一。`[8]` `[12]` `[3]` は両者とも欠落。MLX 固有の破壊ではない。

### terms — 固有名詞・専門用語

`016.128.303`、`NWO`、`Elise van den Hoven`、`Walkman`、`MADLAD-400` は両者とも残る。MPS の方が「本研究は」「助成金番号」と少し丁寧。欠落なし。

---

## 自動品質チェック（補助）

| Case | 空訳 | 極端な短さ | 異常反復 | 数字欠落 | 引用欠落 |
|------|------|------------|----------|----------|----------|
| short〜terms | なし | なし | なし | intro の 8、citations の 8/12/3（MPS も同じ） | 同上 |

最終判断は上の実訳比較。自動指標の `early_eos_suspected` は「全 chunk の出力 tok 合計 vs 1 chunk の上限」で誤検知しうるので、今回は `hit_token_limit=False` と末尾文の有無を優先した。

---

## Go / No-Go

**判定: No-Go（本番 MLX bf16 への切り替えは見送り）**

理由:

1. **速度**: 現行本番（文バッチ 8）対比で平均 **0.68×**。abstract / intro / long は 0.54× / 0.30× / 0.27×。Go 条件の「平均 1.4× かつ長文 1.4×」を満たさない。1.2× すら届かない。
2. **runtime そのもの**: 逐次同士なら平均 **1.10×** で、実質ほぼ同じ tok/s。bf16 のまま MLX に乗り換えても 1.5〜2 倍にはならない。
3. **品質**: INT8 で落ちたタイトル後半・長段落途中停止は bf16 では起きない。実用上 MPS と同等。品質だけ見れば採用候補だが、速度要件を満たさない。
4. **実装**: encoder-decoder を `mlx-lm` に押し込めず、T5 移植 + 変換スクリプトが必要。速度が出ない状態で本番に載せる保守コストに見合わない。

ロード 2.4s vs 26s と、重み 5.5 GiB 固定ファイルは MLX の利点。ただし読書中の段落速度はバッチ済み MPS の方が速い。

---

## 次の STEP について

- **MLX 上の micro-batching（STEP 2）**: 本番に近づけるには必要。intro は MPS 逐次 11.4s → バッチ 3.13s（約 3.6×）。MLX もバッチすれば同程度までは行ける見込み。ただしそれは「現行 MPS に追いつく」話であり、**現行より 2 倍**にはならない。
- **MPS 側の length bucketing / dynamic batch**: すでに batch 8 があるので、余っているのはパディング無駄の削減。2 倍には届きにくいが、長段落では効く可能性はある。
- **INT8 再訪はしない**: 短文 1.6〜1.8× でも欠落するため、今回の優先順位（欠落しない > 品質 > 速度）に反する。

---

## 結論（M4 / 24GB で 2 倍は現実的か）

**ソフトウェア最適化だけで、現行 MPS bf16 + 文バッチ 8 を約 2 倍にするのは、MLX bf16 差し替えでは現実的ではない。**

根拠: 同一 MADLAD-400 3B・同一 greedy・同一文分割で、MLX bf16 の逐次 tok/s は MPS 逐次とほぼ同じ（約 21 tok/s）。以前速かったのは INT8 量子化であり、それは長文欠落で不採用済み。量子化なしの runtime 差は約 10% 程度。

2 倍に近づけるなら、品質を落とす量子化以外の手段（より大きい／賢いバッチ、呼び出し回数そのものの削減）が必要で、それは STEP 2 以降の MPS 側最適化の話になる。MLX bf16 は「INT8 を使わずに MLX へ移れるか」には Yes、「移して 1.5〜2 倍出せるか」には No。
