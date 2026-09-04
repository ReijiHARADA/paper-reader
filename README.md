# Paper Reader

英語の学術論文 PDF を、日本語の Web 記事を読む感覚で読めるローカル向け macOS アプリです。

翻訳は端末内の **MADLAD-400 3B**（Apple Silicon MPS）で行います。論文ファイルは外部の翻訳サービスへ送りません。

- リポジトリ: https://github.com/ReijiHARADA/paper-reader
- これからやること・未達項目: [ROADMAP.md](./ROADMAP.md)
- 開発時の起動手順: [QUICKSTART.md](./QUICKSTART.md)
- 翻訳速度の実測: [translation-server/SPEED_BENCH.md](./translation-server/SPEED_BENCH.md)

いま動いていることはこの README、未達は ROADMAP を正とする。実装を変えたら両方を同じ作業で現状に合わせる。

## いまできること

- **macOS アプリ**: Tauri 2 で `.app` / `.dmg` をビルドできる。配布版は翻訳サーバーを同梱して自動起動する
- **論文ライブラリ**: All Papers / Inbox / Favorites / Recently Read / Project の論文カードは同じレイアウト（正方形アイコン、訳題、原題、著者、処理状態、最終閲覧）。カードから論文を削除できる（アプリ内データと複製 PDF。Finder 上の原本は消さない）。Project のゴミ箱はそのプロジェクトから外すだけで、論文レコードは消さない
- **設定**: 左サイドバー最下部から開く。翻訳サーバーと Ollama の接続確認に加え、サンプル論文をライブラリへ追加できる（サーバー設定とは別項目）
- **Project**: 研究テーマごとに論文をまとめる（論文実体は 1 つ。所属は多対多）。カードをサイドバーのプロジェクトへドラッグして追加し、Inbox へドラッグして戻す。同じ Project へ再度落とすと「すでに入っています」と出す。プロジェクト画面の「論文を追加」から PDF を入れるとその Project に所属する。削除は右上のゴミ箱から行い、論文レコードは残す
- **日本語リーダー**: 1 カラム表示、段落ごとの原文展開、アウトライン、検索（⌘F）、表示設定（文字サイズ・行間・本文幅・ライト／ダーク／システム）、読書位置の保存と復元。論文タイトルは 1 ページ目で本文より大きい行から取る。著者・所属は見出しにせず、リーダー本文にも出さない
- **途中から読む**: 構造解析が終わった時点でリーダーを開ける。翻訳はタイトル → 見出し → Abstract → 本文の順。いま読んでいる付近を優先して訳す。未完了の翻訳は次回起動時に再開する
- **メモ**: 訳文を選択すると Notes が開き、黄色ハイライトとメモを残せる。再翻訳で位置がずれたメモは orphan 扱い
- **翻訳**: 文単位バッチ（既定 24）で MPS 上の MADLAD を呼ぶ。複数段落のリクエストはサーバー側で合流する。段落単位の再試行あり。References・著者・所属・著作権表示・数式・CCS / Index Terms などの分類カタログ行は訳さない。訳さないブロックは「翻訳待ち」にせず原文のまま出す。見出しの訳はアウトライン／セクションタイトル側で行い、画面に出ない見出しブロックの失敗はエラーバナーに出さない。degenerate な訳は破棄する
- **スキャン PDF**: テキストがほぼ無い PDF は Apple Vision で OCR（デスクトップアプリのみ）
- **図表・表・数式・脚注**: 図と表は本文位置に画像とキャプションを出す。キャプションは翻訳し、原文を展開できる。埋め込み画像は切り出し領域との重なり面積が最大のキャプションへ 1 対 1 で割り当て、隣の図まで合成しない。検出できたブロック数式は原文のまま残す。脚注は本文位置に出し、原文を展開できる。ハイフンでつながった英文や参考文献 URL は数式にしない
- **引用**: `[12]` は参考文献が1件に特定できるときだけ、その項目へ飛ぶ。特定できなければリンクしない
- **元 PDF**: インポート時にアプリ管理領域へ複製する。リーダーから別表示で開ける。読み順が不確かな段落からは元 PDF への導線を常時出す
- **抽出信頼度**: 読み順や構造に自信が低い段落には警告を出し、原文／元 PDF へ誘導する
- **用語集**: Ollama が起動していれば専門用語を抽出して保存する（未起動でも翻訳・読書は可能）。生成した用語は訳の後処理と再翻訳に使う。リーダーから閲覧・訳の修正・追加ができる
- **重複 PDF**: 同じファイルハッシュは再インポートせず、既存データを使う
- **パスワード付き PDF**: 処理せず、パスワード保護が理由だと案内する

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
- プロジェクト自体の削除は、そのプロジェクト画面右上のゴミ箱から行います。確認ダイアログのあと、論文ファイルは消えません。他のプロジェクトに入っていない論文は Inbox に戻ります
- プロジェクト画面の「論文を追加」は PDF をインポートし、その Project に所属させます

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

読み順の回帰テストは合成 PDF（`test-fixtures/`）と、jewelry-first-computing の論文リストから集めた実 PDF（gitignore の `test-data/real-papers/`、`npm run fetch:real-papers`）を使います。実論文 PDF はリポジトリに入れません。jewelry-first-computing 側のディレクトリやデータは変更しません。助成番号（`016.128.303` のように先頭が 0 または 3 桁以上の点区切り）は節番号見出しにせず、直前の `grant number` 行と同一段落にまとめます。訳文に残った原文の固有名詞・番号は、ラテン文字比率の判定から除外します。

レイアウト・キャプション・表・数式・脚注の抽出はインポート時に決まるため、既存の論文へ適用するには再インポートが必要です。

## 構成

```text
PDF
 ↓
pdf.js 3.11（デジタル） / Apple Vision OCR（スキャン）
 ↓
構造化（見出し・段落・図／表キャプション・数式・脚注）
 ├─ MADLAD 3B（MPS + bfloat16、文バッチ、用語集は訳後置換）
 └─ Ollama（任意: 用語集の生成。未起動でも翻訳は進む）
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
│   │   ├── reader/            # リーダー・Notes・用語集・検索
│   │   ├── import/
│   │   └── settings/
│   ├── services/
│   │   ├── translation/       # MADLAD クライアントと翻訳キュー
│   │   ├── llm/               # Ollama（用語集）
│   │   ├── pdfjsRuntime.ts    # WKWebView 向け pdf.js 3.11
│   │   ├── pdfLayout.ts       # 2段組の読み順推定
│   │   ├── extractionConfidence.ts
│   │   ├── citations.ts
│   │   ├── ocrService.ts
│   │   ├── projectService.ts
│   │   ├── annotationService.ts
│   │   └── importServiceV2.ts
│   └── stores/
├── src-tauri/                 # Tauri 2（サーバー起動、Vision OCR、元PDF）
├── translation-server/        # FastAPI + MADLAD
├── test-fixtures/             # 読み順回帰用の合成 PDF と実論文カタログ
├── test-data/real-papers/     # 実論文 PDF（gitignore。`npm run fetch:real-papers`）
├── scripts/fetch-real-papers.mjs
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

文をまとめて `generate()` するバッチ（既定 `MADLAD_BATCH_SIZE=24`）と、複数段落の chunk 合流で、論文全体の翻訳は段落ごとより約 2 倍速くなります。測定は `translation-server/MPS_BATCH_OPTIMIZATION_REPORT.md` にあります。

翻訳単位は段落です。前後段落は MADLAD には渡していません。用語集は MADLAD の入力には載せせず、訳の後処理（残った英語用語の置換）と再翻訳時に使います。

## 注意

- 翻訳サーバーはメモリを大きく使います。他の重いプロセスと同時起動すると落ちることがあります
- スキャン PDF の OCR はデスクトップアプリ限定です。`npm run dev` のブラウザ単体では動きません
- pdf.js は **3.11（legacy）** に固定です。6.x は WKWebView で Iterator Helpers が無くクラッシュします
- 2 段組の読み順は代表的な ACM 論文では左列→右列になるが、実論文すべてで崩れないわけではない。残作業は [ROADMAP.md](./ROADMAP.md)
- PDF メタデータが会議名だけのとき、タイトルは本文抽出を優先する。既存論文へ適用するには再インポートが必要
- 元 PDF は開けるが、いま読んでいるブロックのページ指定はまだ無視している
- Favorites にスターを付ける操作はまだない

## ライセンス

ソースは公開しています。ライセンス表記は未定です。
