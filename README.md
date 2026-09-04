# Paper Reader

英語の学術論文 PDF を、日本語の Web 記事を読む感覚で読めるローカル向け macOS アプリです。

翻訳は端末内の **MADLAD-400 3B**（Apple Silicon MPS）で行います。論文ファイルは外部の翻訳サービスへ送りません。

- リポジトリ: https://github.com/ReijiHARADA/paper-reader
- 製品方針: [SPEC.md](./SPEC.md)
- 開発時の起動手順: [QUICKSTART.md](./QUICKSTART.md)
- 翻訳速度の実測: [translation-server/SPEED_BENCH.md](./translation-server/SPEED_BENCH.md)

## いまできること

- **macOS アプリ**: Tauri 2 で `.app` / `.dmg` をビルドできる。配布版は翻訳サーバーを同梱して自動起動する
- **論文ライブラリ**: All Papers / Inbox / Favorites / Recently Read
- **Project**: 研究テーマごとに論文をまとめる（論文実体は 1 つ。所属は多対多）
- **日本語リーダー**: 1 カラム表示、段落ごとの原文展開、アウトライン、検索（⌘F）、表示設定、読書位置の保存
- **翻訳**: タイトル → Abstract → 本文の順。文単位バッチ（既定 8）で MPS 上の MADLAD を呼ぶ
- **スキャン PDF**: テキストがほぼ無い PDF は Apple Vision で OCR（デスクトップアプリのみ）
- **用語集**: Ollama が起動していれば専門用語を抽出（未起動でも翻訳・読書は可能）

## 必要環境

- Apple Silicon Mac（推奨: 24GB 以上。翻訳サーバーが約 8–10GB 使う）
- macOS 上の Xcode（`.app` ビルド時）
- Node.js 18 以上
- Python 3.12（Homebrew の `python@3.12` ではなく、`uv` が入れる公式 3.12 を推奨）
- 任意: [Ollama](https://ollama.com)（用語集）

## 使い方

### ビルド済みアプリ

```bash
npm install
npm run tauri:build
```

生成物:

- `src-tauri/target/release/bundle/macos/Paper Reader.app`
- `src-tauri/target/release/bundle/dmg/Paper Reader_0.1.0_aarch64.dmg`

`.app` を開くと翻訳サーバーが自動起動します。初回は MADLAD の重み（約 6GB）の取得と読み込みに時間がかかります。

### 開発

翻訳サーバー用の Python 環境を一度だけ作ります。

```bash
brew install uv
cd translation-server
uv python install 3.12
uv venv --python 3.12 .venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

その後、リポジトリルートで:

```bash
npm install
npm run tauri:dev
```

ブラウザだけで UI を見る場合は `npm run dev`（http://localhost:5173）。このときは別ターミナルで `./restart-translation-server.sh` が必要です。OCR は Tauri 上でのみ動きます。

詳細とトラブルシューティングは [QUICKSTART.md](./QUICKSTART.md) を見てください。

## 構成

```text
PDF
 ↓
pdf.js 3.11（デジタル） / Apple Vision OCR（スキャン）
 ↓
構造化（見出し・段落・図表）
 ├─ MADLAD 3B（MPS + bfloat16、文バッチ）
 └─ Ollama（任意: 用語集）
 ↓
IndexedDB（論文・Project・翻訳キャッシュ）
 ↓
Reader UI（React + Tauri）
```

```text
paper-reader/
├── src/                       # React UI
│   ├── components/
│   │   ├── shell/             # 常設サイドバー
│   │   ├── library/           # All Papers / Inbox / Favorites / Recent
│   │   ├── project/           # Project 画面と所属操作
│   │   ├── reader/            # リーダー
│   │   ├── import/
│   │   └── settings/
│   ├── services/
│   │   ├── translation/       # MADLAD クライアントと翻訳キュー
│   │   ├── llm/               # Ollama
│   │   ├── pdfjsRuntime.ts    # WKWebView 向け pdf.js 3.11
│   │   ├── ocrService.ts
│   │   ├── projectService.ts
│   │   └── importServiceV2.ts
│   └── stores/
├── src-tauri/                 # Tauri 2（サーバー起動、Vision OCR）
├── translation-server/        # FastAPI + MADLAD
├── scripts/bundle-python.sh   # リリース時に venv を同梱
├── restart-translation-server.sh
└── QUICKSTART.md
```

## 翻訳について

本番エンジンは **MADLAD-400 3B + MPS + bfloat16** です。コミュニティの MLX INT8 は長い段落で訳が途中切れするため使いません。

文をまとめて `generate()` するバッチ（既定 `MADLAD_BATCH_SIZE=8`）で、複数文の段落は逐次より約 3 倍速くなります。測定と不採用理由は `translation-server/SPEED_BENCH.md` にあります。

## 注意

- 翻訳サーバーはメモリを大きく使います。他の重いプロセスと同時起動すると落ちることがあります
- スキャン PDF の OCR はデスクトップアプリ限定です。`npm run dev` のブラウザ単体では動きません
- 2 段組の読み順は改善中です。列が混ざる PDF があります

## ライセンス

ソースは公開しています。ライセンス表記は未定です。
