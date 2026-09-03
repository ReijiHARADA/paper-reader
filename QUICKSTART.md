# Paper Reader クイックスタート

## 初回セットアップ（1回のみ）

### 1. 翻訳サーバーのセットアップ

まず、`uv`をインストール（高速なPythonパッケージマネージャー）:

```bash
brew install uv
```

次に、翻訳サーバーをセットアップ:

```bash
cd ~/Desktop/codex/projects/paper-reader/translation-server
./update_python_env.sh
```

手動で行う場合は **Homebrew の python@3.12 を使わない** こと。macOS 26 では `platform.mac_ver()` が空になり、`python -m venv` が失敗します。`uv` が配布する Python を使います:

```bash
cd ~/Desktop/codex/projects/paper-reader/translation-server
uv python install 3.12
uv venv --python 3.12 .venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

### 2. Ollamaのインストール

```bash
brew install ollama
ollama pull gemma2:9b
```

### 3. アプリの依存関係インストール

```bash
cd ~/Desktop/codex/projects/paper-reader
npm install
```

---

## 日常的な起動手順

**重要**: まずプロジェクトディレクトリに移動してください

```bash
cd ~/Desktop/codex/projects/paper-reader
```

### 方法1: 便利スクリプトを使用（推奨）

#### 翻訳サーバーの起動

```bash
./restart-translation-server.sh
```

#### Ollama（別ターミナル）

```bash
ollama serve
```

#### フロントエンド（別ターミナル）

```bash
npm run dev
```

### 方法2: 手動起動

#### ターミナル1: 翻訳サーバー

```bash
cd ~/Desktop/codex/projects/paper-reader/translation-server
source .venv/bin/activate
python server.py
```

起動確認: [http://127.0.0.1:8765/health](http://127.0.0.1:8765/health)

#### ターミナル2: Ollama

```bash
ollama serve
```

確認:

```bash
curl http://localhost:11434/api/tags
```

#### ターミナル3: アプリ

```bash
cd ~/Desktop/codex/projects/paper-reader
npm run dev
```

ブラウザで [http://localhost:5173](http://localhost:5173) を開く

---

## トラブルシューティング

### 翻訳サーバーに接続できない

```bash
# サーバーが起動しているか確認
curl http://127.0.0.1:8765/health

# エラーが出る場合、ターミナル1のログを確認
```

### Ollamaに接続できない

```bash
# Ollamaが起動しているか確認
curl http://localhost:11434/api/tags

# モデルがインストールされているか確認
ollama list
```

### モデルがダウンロードされていない

```bash
# MADLAD（初回起動時に自動ダウンロード）
# 初回翻訳時に約6GB、5-10分

# Ollama
ollama pull gemma2:9b  # 約5.4GB
```

---

## 簡易起動スクリプト（オプション）

### すべてのサーバーを一度に起動

`start.sh` を作成:

```bash
#!/bin/bash

# 翻訳サーバー起動
cd translation-server
source venv/bin/activate
python server.py &
MADLAD_PID=$!
cd ..

# Ollama起動
ollama serve &
OLLAMA_PID=$!

# アプリ起動
npm run dev &
APP_PID=$!

echo "起動完了"
echo "MADLAD PID: $MADLAD_PID"
echo "Ollama PID: $OLLAMA_PID"
echo "App PID: $APP_PID"
echo ""
echo "終了する場合:"
echo "kill $MADLAD_PID $OLLAMA_PID $APP_PID"

# Ctrl+Cで全プロセス終了
trap "kill $MADLAD_PID $OLLAMA_PID $APP_PID" EXIT
wait
```

実行:

```bash
chmod +x start.sh
./start.sh
```

---

## メモリ使用量の目安

- **MADLAD翻訳サーバー**: 8〜10GB
- **Ollama (gemma2:9b)**: 6〜8GB
- **アプリ**: 500MB〜1GB

合計: 約15〜20GB

**推奨環境**: M4 MacBook Pro / 24GB以上

---

## トラブルシューティング

### 1. 翻訳サーバーがクラッシュする

**症状**: サーバーが `Segmentation fault` で落ちる、500エラーが繰り返される

**原因**: 古い Python 3.9 + MPS、または Homebrew Python の不整合

**対応**:
1. `translation-server/.venv` が Python 3.12 か確認する（`source .venv/bin/activate && python --version`）
2. `PYTORCH_ENABLE_MPS_FALLBACK=1` を付けて起動する（`./restart-translation-server.sh`）
3. それでも落ちる場合は、まず `python test_mps_stages.py` でどの段階で失敗するか切り分ける

CPU固定はデバッグ中の一時措置のみ。通常は MPS を使う。

### 1b. `python -m venv` や `ensurepip` が失敗する

**症状**:
```
ensurepip returned non-zero exit status 1
Broken Python installation, platform.mac_ver() returned an empty value
```

**原因**: Homebrew の `python@3.12` が macOS 26 で `platform.mac_ver()` を空文字で返す。pip / uv がこれを壊れたインストールと判定する。

**解決策**: Homebrew Python は使わない。

```bash
cd ~/Desktop/codex/projects/paper-reader/translation-server
uv python install 3.12
uv venv --python 3.12 .venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

### 2. 論文が重複して表示される

**症状**: 同じPDFをインポートすると2つの論文が表示される

**原因**: 以前のバージョンでReact Strict Modeによる二重インポートが発生

**解決策**:

1. ブラウザの開発者ツールを開く (Cmd+Option+I)
2. Consoleタブで以下を実行:

```javascript
// クリーンアップツールをロード
await import('/src/utils/cleanupDuplicates.ts')

// 重複をチェック（実際には削除しない）
cleanupDuplicatePapers(true)

// 重複を実際に削除する場合
cleanupDuplicatePapers(false)
```

3. ページをリロード

**今後の予防**: 最新版では重複インポートは発生しません。

### 3. 翻訳が表示されない

**症状**: 翻訳中のまま進まない、日本語が表示されない

**確認事項**:

1. **サーバーが起動しているか確認**:
   ```bash
   curl http://127.0.0.1:8765/health
   # → {"status":"ok"} と表示されればOK
   ```

2. **サーバーログを確認**:
   - ターミナルで翻訳サーバーのウィンドウを確認
   - エラーメッセージが出ていないか確認

3. **Ollamaが起動しているか確認**:
   ```bash
   ollama list
   # → モデルのリストが表示されればOK
   ```

### 4. PDFの2段組レイアウトが正しく認識されない

**症状**: 左右の列のテキストが混ざって表示される

**確認事項**:
- まず翻訳が正常に動作することを確認してください
- 現在も改善中の機能です

---

## パフォーマンス改善のヒント

### CPU使用率を下げたい場合

翻訳サーバーのワーカー数を減らす:

1. `translation-server/server.py`を編集
2. `uvicorn.run()`の行を変更:
   ```python
   uvicorn.run(app, host="127.0.0.1", port=8765, workers=1)  # workers を 1 に
   ```

### 翻訳速度を上げたい場合

**✅ GPU対応完了！**

現在、Apple Silicon MacでGPU（MPS）を使用して翻訳を高速化しています:

- **CPU版**: 約15秒/文章
- **MPS版**: 約2秒/文章（**7.2倍高速**）

**確認方法**:

1. サーバーログに以下が表示されるか確認:
   ```
   [DEVICE] Using MPS (Apple Silicon GPU)
   [DTYPE] Selecting bfloat16 for MPS
   ```

2. ベンチマーク結果の詳細は `translation-server/MPS_OPTIMIZATION_REPORT.md` を参照

---

## その他のヘルプ

何か問題があれば、以下の情報を添えて報告してください:

1. エラーメッセージ（あれば）
2. 翻訳サーバーのログ
3. ブラウザのコンソールログ (Cmd+Option+I → Console)
4. macOSバージョンとメモリ容量