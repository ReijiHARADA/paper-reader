# Paper Reader

英語の学術論文 PDF を、日本語の Web 記事を読む感覚で読めるローカル向け macOS アプリです。日本語論文は翻訳せず、抽出したレイアウトのまま読めます。

翻訳は端末内の **MADLAD-400 3B**（Apple Silicon MPS）で行います。論文ファイルは外部の翻訳サービスへ送りません。

- リポジトリ: [https://github.com/ReijiHARADA/paper-reader](https://github.com/ReijiHARADA/paper-reader)
- これからやること・未達項目: [ROADMAP.md](./ROADMAP.md)
- 開発時の起動手順: [QUICKSTART.md](./QUICKSTART.md)
- 翻訳速度の実測: [translation-server/SPEED_BENCH.md](./translation-server/SPEED_BENCH.md)
- 学術 PDF 構造抽出の調査: [ACADEMIC_PDF_EXTRACTION_RESEARCH.md](./ACADEMIC_PDF_EXTRACTION_RESEARCH.md)
- Production 抽出アーキテクチャ: [ACADEMIC_PDF_EXTRACTION_ARCHITECTURE.md](./ACADEMIC_PDF_EXTRACTION_ARCHITECTURE.md)
- 永続化・Paper Package: [DATA_ARCHITECTURE.md](./DATA_ARCHITECTURE.md)

いま動いていることはこの README、未達は ROADMAP を正とする。実装を変えたら両方を同じ作業で現状に合わせる。

## いまできること

- **macOS アプリ**: Tauri 2 で `.app` / `.dmg` をビルドできる。配布版は翻訳サーバーを同梱して自動起動する
- **論文ライブラリ**: すべての論文 / Inbox / お気に入り / 最近読んだ論文 / プロジェクト。論文カードは同じレイアウト（タイトル、著者、読了進捗、読める状態）。内部処理の raw status は出さず、準備中 / 読めます / 日本語化中 / 要確認で見せる。PDF受け取り直後だけ一時カードを出し、実論文カードが生成されたら置き換えるため二重表示しない。All Papers 上部に「続きを読む」（最近読んだ 2〜3 件）。カードの `…` からお気に入り・プロジェクト追加・ライブラリ削除ができる。Project では「Projectから外す」と undo toast。PDF 追加後は Import 画面に留まらず Library へ戻り、カードで進行を見せる。ドロップ直後に受け取り表示と toast を出す。サイドバー検索は「ライブラリを検索」（⌘K）。Reader の ⌘F は「この論文を検索」で、Library 検索にフォーカスしても Reader を離れない
- **設定**: 左サイドバー最下部から、ライブラリと同じ画面遷移で開く。本文は一般 / 翻訳 / 読書 / ストレージ / 診断に分かれ、リーダーのアウトラインと同じ目次で同一ページ内を移動する。サンプル論文の追加は一般。表示設定はリーダーと共通。読書セクションに本文プレビューがあり、文字サイズ・行間・本文幅の変更がすぐ見える。翻訳キャッシュだけを消せる。接続確認は診断（および翻訳の詳細設定）。変更は自動保存
- **Project / Folder**: Folder は整理だけ、Project は論文所属を持つ。Folder の下に Folder / Project を置ける。Project の下に Project は置けない。論文実体は 1 つ（所属は多対多）。カードメニューまたはドラッグで所属を変える。同じ Project へ再度落とすと「すでに入っています」と出す。作成直後の Project もサイドバーとカードメニューへ即時反映する。プロジェクト名の右端にある三点メニューから、名称変更・そのProjectへの論文ファイル追加・Project削除ができる。プロジェクト画面の「論文を追加」から PDF を入れてもその Project に所属する。削除時も論文レコードは消さない。Folder に子があるときは確認を出す。New Project と New Folder は同時に開かない
- **日本語リーダー**: 目次 | 本文 | メモ／用語集の 3 ペイン。目次はヘッダーから隠せる。1 カラム本文、段落ごとの原文展開、検索（⌘F。矢印または Enter で次のヒット、Shift+Enter / ↑ で前へ）、表示設定（文字サイズ・行間・本文幅・ライト／ダーク／システム）、読書位置の保存と復元。論文タイトルは 1 ページ目で本文より大きい行から取る。著者・所属は見出しにせず、リーダー本文にも出さない。日本語の節番号（`1 はじめに`、`2.1` など）と `参考文献` を目次にする。英語副題やローマ字著者行は目次に出さない
- **途中から読む**: PDF 追加後は Library のカードが「準備中」→「読めます / 日本語化中」になる。構造解析が終わった時点でリーダーを開ける。論文を開くと `lastOpenedAt` を記録する。翻訳はタイトル → 見出し → Abstract → 本文の順。いま読んでいる付近を優先して訳す。未完了の翻訳は次回起動時に再開する
- **メモ**: 訳文を選択すると近くに「メモを追加」が出る。Notes と用語集の右パネルは同時には出さない。現行 `.app` では追加〜保存・ハイライトの一連が安定していない（[ROADMAP 3.0](./ROADMAP.md)）。再翻訳で位置がずれたメモは orphan 扱い
- **翻訳**: 文単位バッチ（既定 24）で MPS 上の MADLAD を呼ぶ。複数段落のリクエストはサーバー側で合流する。段落単位の再試行あり。本文の過半が日本語の論文は翻訳せずレイアウトだけ作る。References・著者・所属・著作権表示・数式・CCS / Index Terms などの分類カタログ行は訳さない。訳さないブロックは「翻訳待ち」にせず原文のまま出す。見出しの訳はアウトライン／セクションタイトル側で行い、画面に出ない見出しブロックの失敗はエラーバナーに出さない。degenerate な訳は破棄する
- **スキャン PDF**: テキストがほぼ無い PDF は Apple Vision で OCR（デスクトップアプリのみ）。日本語 CID フォントは CMap でテキスト抽出し、OCR に頼らない
- **図表・表・数式・脚注**: 図と表は本文位置に画像とキャプションを出す。英語の Figure/Table に加え、日本語の `図 n:` / `表 n:` もキャプションとして切り出す。キャプションは翻訳し、原文を展開できる。埋め込み画像は切り出し領域との重なり面積が最大のキャプションへ 1 対 1 で割り当て、隣の図まで合成しない。検出できたブロック数式は原文のまま残す。脚注は本文位置に出し、原文を展開できる。ハイフンでつながった英文や参考文献 URL は数式にしない
- **引用**: `[12]` は参考文献が1件に特定できるときだけ、その項目へ飛ぶ（表示番号と `ref-…` ID は別）。特定できなければリンクしない。参考文献エントリ内の DOI / `https://` はブラウザで開く
- **Markdown 書き出し**: リーダー右上の書き出しから、きれいな Markdown または内部 block comment 付きの検証用 Markdown、検証用パッケージ（`source.pdf` + `translated.md` + `assets/`）を選べる。翻訳失敗箇所の含める／除くも選べる。Tauri では `.md` の隣に `assets/` を書き、browser `npm run dev` は画像があるとき zip にする。現行 `.app` でのダイアログ崩れはソース修正済み（[ROADMAP 3.0](./ROADMAP.md)）。Reader と export は同じ Markdown / Document AST
- **翻訳中の読書**: 翻訳 1 件ごとに Paper Package 全体や `source.pdf` / `assets` / `layout.json.gz` を書き直さない。訳文の反映はバッチし、永続化は checkpoint。スクロール・選択・Outline・Notes は通常時に近い操作感を維持する
- **元 PDF**: インポート時にアプリ管理領域へ複製する。読み順が不確かな段落からは元 PDF への導線を出す。現行 `.app` ではリーダー右上の「元 PDF を開く」アイコンが反応しない（[ROADMAP 3.0](./ROADMAP.md)）
- **抽出信頼度**: 読み順が低い段落は本文左の警告アイコンだけにする。クリックで原文／元 PDF へ誘導する。論文上部に「要確認 N箇所」を集約する
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

`.app` を開くとライブラリがすぐ出ます。翻訳サーバーは裏で起動し、準備中は画面上部に案内が出ます。初回は MADLAD の重み（約 6GB）の取得と読み込みに時間がかかります。

### 論文を Project に入れる

All Papers / Inbox / Favorites / Recently Read のカードを、左サイドバーのプロジェクトへドラッグします。WKWebView では HTML5 の drop が発火しないことがあるため、ポインター追跡でドロップ先を判定しています。

- 論文ファイルはコピーせず、所属だけが増えます
- All Papers / Favorites / Recently Read には残ります
- Inbox の論文は、どれかの Project に入ると Inbox から外れます
- すでに入っているプロジェクトへ落とすと「すでに入っています」と表示されます
- プロジェクトから外して Inbox に戻すときは、カードをサイドバーの Inbox へドラッグします
- プロジェクト自体の削除は、サイドバーでプロジェクト名右端の三点メニューから行います。確認後も論文ファイルは消えず、他のプロジェクトに入っていない論文は Inbox に戻ります
- プロジェクト画面の「論文を追加」は PDF をインポートし、その Project に所属させます。All Papers / Inbox も同じ位置・同じ文言のボタンです
- Finder から PDF をアプリ画面へドロップしてもインポートできます。Project を開いているときはその Project に入ります。受け取るとファイル名を出し、Library のカードで進行を見せます
- カードの `…` からプロジェクトへ追加、お気に入り、ライブラリ削除ができる。Project 画面では「Projectから外す」で所属だけ外し、undo できる

カードの「Add to Project」ボタンはありません。Project の新規作成はサイドバーの New Project、Folder は New Folder です。Folder の削除はサイドバーで右クリックして確認します。

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

ブラウザだけで UI を見る場合は `npm run dev`（[http://localhost:5173）。このときは別ターミナルで](http://localhost:5173）。このときは別ターミナルで) `./restart-translation-server.sh` が必要です。OCR と元 PDF の複製／表示は Tauri 上でのみ動きます。

検証:

```bash
npm test
npm run lint
```

学術 PDF の抽出は CanonicalDocument が Source of Truth です。Import は `extractAcademicPdf` → projection → Paper/Section/PaperBlock です。catalog の `publisher` / `formatFamily` は評価用 Ground Truth であり、本番の format 判定には使いません。助成番号（`016.128.303` のように先頭が 0 または 3 桁以上の点区切り）は節番号見出しにせず、直前の `grant number` 行と同一段落にまとめます。訳文に残った原文の固有名詞・番号は、ラテン文字比率の判定から除外します。詳細は [ACADEMIC_PDF_EXTRACTION_ARCHITECTURE.md](./ACADEMIC_PDF_EXTRACTION_ARCHITECTURE.md)。

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
Paper Package（papers/<paperId>/）+ SQLite（library.sqlite）
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
│   │   ├── pdfExtraction/     # Canonical pipeline（extractAcademicPdf）
│   │   ├── extractionConfidence.ts
│   │   ├── citations.ts
│   │   ├── ocrService.ts
│   │   ├── projectService.ts
│   │   ├── annotationService.ts
│   │   └── importServiceV2.ts
│   ├── data/                  # Paper Package / SQLite / Markdown AST
│   └── stores/
├── src-tauri/                 # Tauri 2（サーバー起動、Vision OCR、元PDF）
├── translation-server/        # FastAPI + MADLAD
├── test-fixtures/             # 読み順回帰用の合成 PDF と実論文カタログ
├── test-data/real-papers/     # 実論文 PDF（gitignore。`npm run fetch:real-papers`）
├── scripts/fetch-real-papers.mjs
├── scripts/benchmark-pdf-extraction.ts
├── ACADEMIC_PDF_EXTRACTION_ARCHITECTURE.md
├── ACADEMIC_PDF_EXTRACTION_RESEARCH.md
├── DATA_ARCHITECTURE.md
├── scripts/bundle-python.sh   # リリース時に venv を同梱
├── restart-translation-server.sh
└── QUICKSTART.md
```

永続化:

- Paper Package（`<AppData>/papers/<paperId>/`）: `source.pdf`、`paper.json`、`original.md`、`ja.md`、`translation.json`、`structure.json`、任意の `layout.json.gz`、`assets/`。`source.pdf` は初回の atomic persist で一緒に書く。`paper.json` は構造化 author / affiliation / DOI を捨てない
- SQLite（`<AppData>/library.sqlite`）: 論文 index、Folder / Project ツリー、所属、Annotation、読書位置、用語集、翻訳キャッシュ、検索 index。本文の正本ではない。schema_version 3（cache 複合キー、hash UNIQUE、FK、`package_revision` handshake）。終了時に flush する
- 旧 IndexedDB（`paper-reader` v4）: 起動時に一度移行し、バックアップとして残す。設定の「翻訳キャッシュを削除」は SQLite の cache だけを消す
- 表示設定: Zustand persist（`paper-reader-storage`）



## 翻訳について

本番エンジンは **MADLAD-400 3B + MPS + bfloat16** です。コミュニティの MLX INT8 は長い段落で訳が途中切れするため使いません。

文をまとめて `generate()` するバッチ（既定 `MADLAD_BATCH_SIZE=24`）と、複数段落の chunk 合流で、論文全体の翻訳は段落ごとより約 2 倍速くなります。測定は `translation-server/MPS_BATCH_OPTIMIZATION_REPORT.md` にあります。

翻訳単位は段落です。前後段落は MADLAD には渡していません。用語集は MADLAD の入力には載せせず、訳の後処理（残った英語用語の置換）と再翻訳時に使います。

## 注意

- 翻訳サーバーはメモリを大きく使います。他の重いプロセスと同時起動すると落ちることがあります
- スキャン PDF の OCR はデスクトップアプリ限定です。`npm run dev` のブラウザ単体では動きません
- pdf.js は **3.11（legacy）** に固定です。6.x は WKWebView で Iterator Helpers が無くクラッシュします。日本語 CID フォント（ToUnicode なし）は `cmaps/` を渡してデコードします
- デスクトップ版の本番 CSP は、WKWebView で Vite の ES module が止まって白い画面になるため、いったん未設定です。再導入は [ROADMAP.md](./ROADMAP.md)
- 2 段組の読み順は代表的な ACM 論文では左列→右列になるが、実論文すべてで崩れないわけではない。残作業は [ROADMAP.md](./ROADMAP.md)
- PDF メタデータが会議名だけのとき、タイトルは本文抽出を優先する。既存論文へ適用するには再インポートが必要
- 日本語論文の目次・著者・図キャプション判定を直したあとも、すでに入れた論文は再インポートが必要（同一ファイルはスキップされるので、一度削除してから入れ直す）
- 元 PDF は開けるが、いま読んでいるブロックのページ指定はまだ無視している
- Favorites にスターを付ける操作はまだない



## ライセンス

Paper Reader のソースコードは MIT License で公開しています。

利用している第三者ライブラリ・モデルには、それぞれのライセンスが適用されます。

詳細: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
