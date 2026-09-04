# Paper Reader

英語の学術論文 PDF を、日本語の Web 記事を読む感覚で読めるローカル向け macOS アプリです。

翻訳は端末内の **MADLAD-400 3B**（Apple Silicon MPS）で行います。論文ファイルは外部の翻訳サービスへ送りません。

- リポジトリ: https://github.com/ReijiHARADA/paper-reader
- これからやること・未達項目: [ROADMAP.md](./ROADMAP.md)
- 開発時の起動手順: [QUICKSTART.md](./QUICKSTART.md)
- 翻訳速度の実測: [translation-server/SPEED_BENCH.md](./translation-server/SPEED_BENCH.md)

## いまできること

- **macOS アプリ**: Tauri 2 で `.app` / `.dmg` をビルドできる。配布版は翻訳サーバーを同梱して自動起動する
- **論文ライブラリ**: All Papers / Inbox / Recently Read。カードから論文を削除できる（アプリ内データと複製 PDF。Finder 上の原本は消さない）
- **Project**: 研究テーマごとに論文をまとめる（論文実体は 1 つ。所属は多対多）。カードをサイドバーのプロジェクトへドラッグして追加し、Inbox へドラッグして戻す。同じ Project へ再度落とすと「すでに入っています」と出す。Project の削除はプロジェクト画面から行い、論文レコードは残す
- **日本語リーダー**: 1 カラム表示、段落ごとの原文展開、アウトライン、検索（⌘F）、表示設定（文字サイズ・行間・本文幅・ライト／ダーク／システム）、読書位置の保存と復元
- **途中から読む**: 構造解析が終わった時点でリーダーを開ける。翻訳はタイトル → 見出し → Abstract → 本文の順。いま読んでいる付近を優先して訳す。未完了の翻訳は次回起動時に再開する
- **メモ**: 訳文を選択すると Notes が開き、黄色ハイライトとメモを残せる。再翻訳で位置がずれたメモは orphan 扱い
- **翻訳**: 文単位バッチ（既定 8）で MPS 上の MADLAD を呼ぶ。段落単位の再試行あり。References・著者・所属・著作権表示は訳さない。 degenerate な訳は破棄する
- **スキャン PDF**: テキストがほぼ無い PDF は Apple Vision で OCR（デスクトップアプリのみ）
- **図表**: 図画像を本文中に表示し、拡大できる。キャプションは原文のまま出す
- **元 PDF**: インポート時にアプリ管理領域へ複製する。リーダーから別表示で開ける
- **抽出信頼度**: 読み順や構造に自信が低い段落には警告を出し、原文／元 PDF へ誘導する
- **用語集**: Ollama が起動していれば専門用語を抽出して保存する（未起動でも翻訳・読書は可能。訳文への適用はまだしない）
- **重複 PDF**: 同じファイルハッシュは再インポートせず、既存データを使う

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

### 論文を Project に入れる

All Papers / Inbox / Favorites / Recently Read のカードを、左サイドバーのプロジェクトへドラッグします。WKWebView では HTML5 の drop が発火しないことがあるため、ポインター追跡でドロップ先を判定しています。

- 論文ファイルはコピーせず、所属だけが増えます
- All Papers / Favorites / Recently Read には残ります
- Inbox の論文は、どれかの Project に入ると Inbox から外れます
- すでに入っているプロジェクトへ落とすと「すでに入っています」と表示されます
- プロジェクトから外して Inbox に戻すときは、カードをサイドバーの Inbox へドラッグします
- プロジェクト自体の削除は、そのプロジェクト画面の「プロジェクトを削除」から行います。論文ファイルは消えません。他のプロジェクトに入っていない論文は Inbox に戻ります

カードの「Add to Project」ボタンはありません。Project の新規作成はサイドバーの New Project です。

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

Xcode が `/Applications/Xcode-beta.app` の場合は `DEVELOPER_DIR` を設定してから `npm run tauri:dev` します。詳細は [QUICKSTART.md](./QUICKSTART.md) を見てください。

ブラウザだけで UI を見る場合は `npm run dev`（http://localhost:5173）。このときは別ターミナルで `./restart-translation-server.sh` が必要です。OCR と元 PDF の複製／表示は Tauri 上でのみ動きます。

検証:

```bash
npm test
npm run lint
```

読み順の回帰テストは合成 PDF（`test-fixtures/`）を使います。実論文 PDF はリポジトリに入れていません。助成番号（`016.128.303` のように先頭が 0 または 3 桁以上の点区切り）は節番号見出しにせず、直前の `grant number` 行と同一段落にまとめます。訳文に残った原文の固有名詞・番号は、ラテン文字比率の判定から除外します。

既存の論文はインポート時の構造を IndexedDB に保持しているため、この修正を既存データへ適用するには再インポートが必要です。

## 構成

```text
PDF
 ↓
pdf.js 3.11（デジタル） / Apple Vision OCR（スキャン）
 ↓
構造化（見出し・段落・図表キャプション）
 ├─ MADLAD 3B（MPS + bfloat16、文バッチ）
 └─ Ollama（任意: 用語集の生成のみ）
 ↓
IndexedDB（論文・Project・翻訳キャッシュ・メモ）
アプリ管理領域（papers/<paperId>/source.pdf）
 ↓
Reader UI（React + Tauri）
```

```text
paper-reader/
├── src/                       # React UI
│   ├── components/
│   │   ├── shell/             # 常設サイドバー
│   │   ├── library/           # All Papers / Inbox / Favorites / Recent
│   │   ├── project/           # Project 画面（所属の解除など）
│   │   ├── reader/            # リーダー・Notes・検索
│   │   ├── import/
│   │   └── settings/
│   ├── services/
│   │   ├── translation/       # MADLAD クライアントと翻訳キュー
│   │   ├── llm/               # Ollama（用語集）
│   │   ├── pdfjsRuntime.ts    # WKWebView 向け pdf.js 3.11
│   │   ├── pdfLayout.ts       # 2段組の読み順推定
│   │   ├── ocrService.ts
│   │   ├── projectService.ts
│   │   ├── annotationService.ts
│   │   └── importServiceV2.ts
│   └── stores/
├── src-tauri/                 # Tauri 2（サーバー起動、Vision OCR、元PDF）
├── translation-server/        # FastAPI + MADLAD
├── test-fixtures/             # 読み順回帰用の合成 PDF
├── scripts/bundle-python.sh   # リリース時に venv を同梱
├── restart-translation-server.sh
└── QUICKSTART.md
```

永続化:

- IndexedDB（`paper-reader`、schema v4）: 論文メタデータ、セクション、ブロック、Project、メモ、翻訳キャッシュ、用語集
- アプリデータディレクトリ: `papers/<paperId>/source.pdf`
- 表示設定: Zustand persist（`paper-reader-storage`）

## 翻訳について

本番エンジンは **MADLAD-400 3B + MPS + bfloat16** です。コミュニティの MLX INT8 は長い段落で訳が途中切れするため使いません。

文をまとめて `generate()` するバッチ（既定 `MADLAD_BATCH_SIZE=8`）で、複数文の段落は逐次より約 3 倍速くなります。測定と不採用理由は `translation-server/SPEED_BENCH.md` にあります。

翻訳単位は段落です。前後段落や用語集は MADLAD には渡していません。

## 注意

- 翻訳サーバーはメモリを大きく使います。他の重いプロセスと同時起動すると落ちることがあります
- スキャン PDF の OCR はデスクトップアプリ限定です。`npm run dev` のブラウザ単体では動きません
- pdf.js は **3.11（legacy）** に固定です。6.x は WKWebView で Iterator Helpers が無くクラッシュします
- 2 段組の読み順、表・数式・脚注の表示、キャプション翻訳、用語集の適用などは未完成です。残作業は [ROADMAP.md](./ROADMAP.md) を見てください

## ライセンス

ソースは公開しています。ライセンス表記は未定です。
