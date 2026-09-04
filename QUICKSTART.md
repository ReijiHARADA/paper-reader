# Paper Reader 起動手順

リポジトリのルート（`package.json` がある場所）で実行してください。

## 初回だけ

### 1. 翻訳サーバー

Homebrew の `python@3.12` は使わないでください。macOS 26 では `platform.mac_ver()` が空になり、venv 作成が失敗します。`uv` の公式 3.12 を使います。

```bash
brew install uv
cd translation-server
uv python install 3.12
uv venv --python 3.12 .venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

仮想環境が壊れたときだけ `./update_python_env.sh` を使います。日常の再起動には不要です。

### 2. フロントエンド

```bash
npm install
```

### 3. 任意: Ollama（用語集）

```bash
brew install ollama
ollama pull gemma2:9b
```

翻訳と論文表示だけなら Ollama は不要です。

---

## 日常の起動

### 推奨: Tauri 開発アプリ

翻訳サーバーはアプリ側が `.venv` を見つけて起動します。

```bash
npm run tauri:dev
```

Xcode が `/Applications/Xcode-beta.app` の場合:

```bash
export DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer
npm run tauri:dev
```

### ブラウザ UI だけ（OCR なし）

ターミナル 1:

```bash
./restart-translation-server.sh
```

ターミナル 2:

```bash
npm run dev
```

http://localhost:5173 を開きます。翻訳サーバーの確認:

```bash
curl http://127.0.0.1:8765/health
```

`{"status":"ok","model_loaded":true}` なら準備完了です。

### 一括起動（ブラウザ開発）

```bash
./start.sh
```

翻訳サーバーと `npm run dev` をまとめて起動します。Ollama も起動を試みます。

### リリース用 `.app`

```bash
npm run tauri:build
open "src-tauri/target/release/bundle/macos/Paper Reader.app"
```

`beforeBuildCommand` が `scripts/bundle-python.sh` で `.venv` を `translation-server/venv/` にコピーしてからフロントをビルドします。

### テストと実論文 PDF

```bash
npm test
npm run lint
npm run bench:pdf-extraction
```

実論文の読み順テスト用 PDF はリポジトリに入れません。カタログは `test-fixtures/real-papers/catalog.json`、キャッシュは gitignore の `test-data/real-papers/` です。catalog の formatFamily は評価用 Ground Truth です。

```bash
npm run fetch:real-papers
```

jewelry-first-computing 側のディレクトリやデータは変更しません。

---

## トラブルシューティング

### 翻訳サーバーに繋がらない

```bash
curl http://127.0.0.1:8765/health
./restart-translation-server.sh
```

`.app` ではポート **8765** を使います。UI が 8000 を見ている古いビルドは使わないでください。

### `python -m venv` / ensurepip が失敗する

Homebrew Python が原因です。上の `uv` 手順で `.venv` を作り直してください。

### Segmentation fault / 500

1. `.venv` が Python 3.12 か確認する（`source translation-server/.venv/bin/activate && python --version`）
2. `./restart-translation-server.sh` で `PYTORCH_ENABLE_MPS_FALLBACK=1` 付き起動にする
3. `cd translation-server && python test_mps_stages.py` で切り分ける

### PDF を開いた瞬間に落ちる

pdf.js 6 は Tauri の WKWebView で動きません。依存は **pdfjs-dist 3.11** のままにしてください。

### OCR が動かない

Apple Vision は `.app` または `npm run tauri:dev` だけです。ブラウザの `npm run dev` では動きません。

### 翻訳が進まない

```bash
curl http://127.0.0.1:8765/health
```

サーバーログに `[DEVICE] Using MPS` と `[DTYPE] ... bfloat16` が出ているか見てください。

---

## メモリの目安

| プロセス | 目安 |
|---|---|
| MADLAD 翻訳サーバー | 8–10GB |
| Ollama gemma2:9b（任意） | 6–8GB |
| UI | 0.5–1GB |

推奨: Apple Silicon / 24GB 以上。

## 速度

複数文の段落は文バッチ（既定 24）で、論文全体は micro-batch 合流込みで段落ごとよりおおよそ 2 倍速いです。詳細は `translation-server/MPS_BATCH_OPTIMIZATION_REPORT.md` と `translation-server/SPEED_BENCH.md` です。
