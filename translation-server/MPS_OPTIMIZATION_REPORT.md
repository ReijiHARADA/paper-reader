# MADLAD MPS 最適化レポート（Python 3.12 実測）

**日時**: 2026-09-03  
**環境**: M4 MacBook Pro / 24GB / macOS 26.0

---

## 結論

PyTorch MPS を継続する。最終構成は **MPS + bfloat16**。CPU は MPS 初期化失敗時の fallback のみ。MLX への移行は不要。

---

## ベンチマーク（同一英文）

```
入力: "Attention is all you need introduced the Transformer architecture for neural machine translation."
```

| 設定 | 翻訳時間 | 出力 tokens | tokens/sec | 安定 |
|------|----------|-------------|------------|------|
| CPU fp32 | 67.57s | 513 | 7.59 | yes |
| **MPS bfloat16** | **3.16s** | **71** | **22.44** | **yes** |
| MPS float16 | 27.67s | 513 | 18.54 | yes |
| MPS float32 | 51.30s | 513 | 10.00 | yes |

```
                  CPU fp32    MPS bf16    MPS fp16    MPS fp32
translation       67.57s      3.16s       27.67s      51.30s
output tokens     513         71          513         513
tokens/sec        7.59        22.44       18.54       10.00
stable            yes         yes         yes         yes
```

壁時計比は **21.4x** だが、CPU / fp16 / fp32 は EOS を出さず 513 tokens まで走り続けた。生成速度比は **22.44 / 7.59 ≒ 3.0x**。bfloat16 だけが妥当な長さで止まっている。

---

## 報告項目

1. **MPSクラッシュの直接的な原因**  
   「M4 では MPS が使えない」ではない。  
   - 旧クラッシュは `tanh_kernel_mps` 上の SIGSEGV。  
   - 同時に 2 本の `/translate` が Metal 上で走っていた。MPS は並列 generate に弱い。  
   - Python 3.9.6 + 古いロード経路（meta tensor → MPS）も悪化要因。  
   対策: 推論をロックで直列化、`PYTORCH_ENABLE_MPS_FALLBACK=1`、dtype は bfloat16。

2. **Python 3.9.6 が影響していたか**  
   部分的に yes。3.9 自体が MPS 不能なわけではないが、Homebrew / CommandLineTools 混在と古い venv が不安定だった。3.12 では MPS tensor 演算・モデルロード・generate がすべて成功。

3. **更新したバージョン**  
   - Python: 3.12.14（uv 配布。Homebrew python@3.12 は `mac_ver()` が空で使えない）  
   - PyTorch: 2.14.0  
   - Transformers: 5.16.1  

4. **最終 device**  
   `mps`

5. **最終 dtype**  
   `bfloat16`

6. **93文字テスト CPU 実測**  
   67.57s / 513 output tokens / 7.59 tok/s（EOS 未発火で上限到達）

7. **同一テスト MPS 実測**  
   3.16s / 71 output tokens / 22.44 tok/s

8. **output token 数**  
   bf16: 71（妥当）。他: 513（`max_new_tokens=512` までループ）。generate 設定の問題。

9. **generate 設定に問題があったか**  
   あった。固定 `max_new_tokens=512` + greedy で EOS を逃すと 513 tokens になる。本番は `input_tokens * 3 + 24`（上限 256）と `repetition_penalty=1.15` に変更済み。

10. **CPU 比**  
    壁時計 21.4x。トークン速度 約 3.0x。運用上は bf16 の 3.16s が基準。

11. **長文論文に耐えられるか**  
    段落単位なら可。93文字で約 3.2s、1ページを 10〜20 段落とすると約 30〜60s。モデルは起動時に 1 回だけロード。並列推論はしない。

12. **PyTorch MPS を継続するか MLX か**  
    **PyTorch MPS + bfloat16 を継続。** その後の文バッチと MLX INT8 の実測は `SPEED_BENCH.md`。コミュニティ INT8 は段落欠落のため不採用。

---

## 本番設定

- device: mps  
- dtype: bfloat16  
- モデル: 起動時に 1 回ロード  
- 推論: プロセス内ロックで直列。文チャンクは最大 8 件を 1 回の generate に載せる (`MADLAD_BATCH_SIZE`)  
- CPU: MPS 失敗時のみ  
- 速度の継続ログ: `SPEED_BENCH.md`  
