# MPS最適化実装手順書

このガイドに従って、M4 MacBook ProでMADLAD翻訳をMPS（GPU）で高速実行できるようにします。

## 📋 前提条件

- M4 MacBook Pro
- 24GB RAM
- macOS
- Homebrew インストール済み

## 🚀 実行手順

### ステップ1: Python環境の更新

現在のPython 3.9.6からPython 3.12へ更新し、MPS対応のPyTorchをインストールします。

```bash
cd ~/Desktop/codex/projects/paper-reader/translation-server
chmod +x update_python_env.sh
./update_python_env.sh
```

**確認事項:**
- Python 3.12がインストールされる
- PyTorch 2.2+がインストールされる  
- MPS available: True と表示される

### ステップ2: CPU基準値の測定

まず現在のCPU版の性能を測定します（比較基準）。

```bash
source .venv/bin/activate
python benchmark_cpu_baseline.py
```

**記録すべき値:**
- Translation time (秒)
- Tokens/sec
- Output tokens数

結果例:
```
Translation time: 14.40s
Tokens/sec: 15.90
Output tokens: 227
```

### ステップ3: MPS段階的検証

MPSが各段階で正常に動作するか確認します。

```bash
PYTORCH_ENABLE_MPS_FALLBACK=1 python test_mps_stages.py
```

**確認ポイント:**

1. **Stage 1**: Tensor演算
   - ✓ なら次へ
   - ❌ なら → MPSが利用不可（Pythonバージョンを確認）

2. **Stage 2**: モデルロード（各dtype）
   - どのdtypeで成功したか記録
   - 推奨: bfloat16 → float16 → float32の順

3. **Stage 3**: Tokenization
   - ✓ なら次へ

4. **Stage 4**: 短文生成
   - ✓ なら次へ
   - ❌ なら → クラッシュ原因を調査（ログを確認）

5. **Stage 5**: 完全翻訳
   - Translation timeを記録
   - CPUより速ければ成功

### ステップ4: ベンチマーク比較

CPU版とMPS版（各dtype）を自動比較します。

```bash
python benchmark_comparison.py
```

**結果の見方:**

```
Config          Load(s)    Trans(s)   Tokens   Tok/s      Stable   
--------------------------------------------------------------------------------
CPU fp32        2.50       14.40      227      15.77      ✓        (baseline)
MPS bfloat16    1.80       1.50       227      151.33     ✓        (9.6x)
MPS float16     1.80       1.60       227      141.88     ✓        (9.0x)
MPS float32     2.00       3.20       227      70.94      ✓        (4.5x)
```

**判断基準:**

- **9-10x高速化**: 理想的（bfloat16/float16で達成できる場合）
- **5-8x高速化**: 良好
- **2-4x高速化**: 許容範囲
- **1x未満**: CPU使用を検討

### ステップ5: サーバーに統合

ベンチマークで最速だったdtypeを使用するようサーバーを更新します。

#### 5-1. 新しいエンジンを使用

`server.py`を編集:

```python
# 変更前
from engines import get_engine

# 変更後
from engines.madlad_mps import get_engine
```

#### 5-2. サーバーを再起動

```bash
# 既存サーバーを停止
pkill -f "python.*server.py"

# 新しいバージョンで起動
python server.py
```

#### 5-3. 動作確認

別ターミナルで:

```bash
curl http://127.0.0.1:8765/health
# → {"status":"ok"}

curl -X POST http://127.0.0.1:8765/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "source_language": "en",
    "target_language": "ja"
  }'
```

**ログ確認:**

```
[DEVICE] Using MPS (Apple Silicon GPU)
[DTYPE] Selecting bfloat16 for MPS
[BENCHMARK]
  Device: mps
  Dtype: torch.bfloat16
  Tokens/sec: 150.00
```

### ステップ6: アプリで実際のPDFをテスト

1. フロントエンドアプリを起動
   ```bash
   cd ~/Desktop/codex/projects/paper-reader
   npm run dev
   ```

2. ブラウザで`http://localhost:5173`を開く

3. PDFをインポート

4. 翻訳速度を体感
   - 10秒程度でページが翻訳されれば成功

## 🔍 トラブルシューティング

### エラー: "MPS available: False"

**原因**: PyTorchがMPSをサポートしていない

**解決策**:
```bash
# PyTorchバージョン確認
python -c "import torch; print(torch.__version__)"

# 2.2未満の場合は再インストール
pip install --upgrade torch>=2.2.0
```

### エラー: Stage 4/5 でSegmentation Fault

**原因**: 特定のdtypeまたはoperationがMPS未対応

**解決策**:

1. **bfloat16で失敗** → float16を試す
2. **float16で失敗** → float32を試す  
3. **全て失敗** → CPU fallbackを使用

`madlad_mps.py`で強制的にdtypeを指定:

```python
engine = MADLADEngine(dtype=torch.float16)  # float16を強制
```

### エラー: Output tokensが多すぎる（200+）

**原因**: `max_new_tokens`が大きすぎる

**解決策**: `madlad_mps.py`の`translate()`メソッドで調整済み:

```python
max_new_tokens = min(input_tokens * 3 + 20, 512)
```

これでoutput tokensが適切な範囲（50-100程度）に収まるはずです。

### エラー: MPSは動くが遅い

**原因**: Fallbackが多発している可能性

**確認方法**:
```bash
# Fallback警告を表示
PYTORCH_ENABLE_MPS_FALLBACK=1 python test_mps_stages.py 2>&1 | grep -i fallback
```

**対策**: 
- CPU fallbackのみの運用を検討
- または MLX への移行を検討（次のステップ）

## 📊 期待される結果

### 目標値（M4 MacBook Pro）

| 項目 | CPU fp32 | MPS bfloat16 | 改善率 |
|------|----------|--------------|--------|
| 翻訳時間（93文字） | 14.4秒 | 1.5秒 | 9.6x |
| Tokens/sec | 15.8 | 150+ | 9.5x |
| 論文1ページ翻訳 | 30-60秒 | 3-6秒 | 10x |

### 最低許容値

- **翻訳時間**: 5秒以下（93文字テスト）
- **Speedup**: 3x以上
- **安定性**: クラッシュなし

## 📝 報告フォーマット

実行後、以下をまとめて報告してください:

```
### 環境
- Python: 3.12.x
- PyTorch: 2.x.x
- Machine: arm64
- macOS: x.x.x

### CPU基準値
- Translation time: xx.xx s
- Tokens/sec: xx.xx
- Output tokens: xxx

### MPS結果
- Working dtype: bfloat16 / float16 / float32
- Translation time: xx.xx s  
- Tokens/sec: xx.xx
- Speedup: x.x倍
- Stable: Yes / No

### 推奨設定
Device: mps
Dtype: bfloat16

### 問題
(あれば記載)
```

## 🎯 次のステップ

### MPS成功の場合

1. サーバーを新エンジンに切り替え
2. 実際のPDFで性能確認
3. `madlad.py`を`madlad_mps.py`に完全置き換え

### MPS失敗の場合

MLX調査に進む（`mps-8` TODO）:
- MLXでのT5/MADLAD実行可能性
- モデル変換の必要性
- 性能・品質のトレードオフ

---

## ✅ チェックリスト

- [ ] Python 3.12環境構築完了
- [ ] CPU基準値測定完了
- [ ] MPS段階的検証完了
- [ ] ベンチマーク比較完了
- [ ] 推奨dtype決定
- [ ] サーバー統合完了
- [ ] PDF翻訳テスト完了
- [ ] 結果報告作成
