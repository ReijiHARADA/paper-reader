# Paper Reader

英語論文PDFを日本語で読むためのデスクトップアプリケーション。

**📖 [クイックスタート（起動方法）はこちら](./QUICKSTART.md)**

## 概要

Paper Readerは、英語の学術論文を日本語のWeb記事を読むような感覚で読めることを目指したローカル動作のデスクトップリーダーです。

## アーキテクチャ

```text
PDF
 ↓
PDF Parser
 ↓
Document Structure
 ├───────────────┐
 ↓               ↓
Translation      LLM Analysis
Engine           Engine
 ↓               ↓
MADLAD 3B        Ollama
 ↓               ↓
日本語本文        要約 / 用語集 / QA
 └──────┬────────┘
        ↓
     Reader UI
```

### 役割分離

- **翻訳（MADLAD-400 3B）**: 本文の英日翻訳に特化。高速・高品質。
- **LLM分析（Ollama）**: 要約、用語集生成、質問応答などの理解タスク。

## 要件

### ハードウェア

- M4 MacBook Pro / 24GB unified memory（推奨）
- または同等以上のApple Silicon Mac

### ソフトウェア

- Node.js 18以上
- Python 3.10以上
- Ollama

## セットアップ

### 1. 翻訳サーバー（MADLAD）

```bash
cd translation-server

# 仮想環境を作成
python3 -m venv venv
source venv/bin/activate

# 依存関係をインストール
pip install -r requirements.txt

# サーバー起動（別ターミナル）
python server.py
```

初回起動時にモデル（約6GB）がダウンロードされます。

### 2. Ollama

```bash
# インストール
brew install ollama

# サーバー起動（別ターミナル）
ollama serve

# モデルダウンロード
ollama pull gemma2:9b
```

### 3. アプリケーション

```bash
# 依存関係をインストール
npm install

# 開発サーバー起動
npm run dev
```

ブラウザで http://localhost:5173 を開きます。

## 機能

### 翻訳機能

- **優先度ベース翻訳**: タイトル→Abstract→現在ページの順で翻訳
- **翻訳キャッシュ**: 同じ文章の再翻訳を回避
- **部分表示**: 翻訳完了部分から順次表示

### LLM分析機能

- **用語集自動生成**: 論文読み込み時に専門用語を抽出
- **要約生成**: 論文全体の日本語要約
- **質問応答**: 論文内容に関する質問

### 読書機能

- 1カラムの日本語本文表示
- 段落ごとの原文インライン展開
- 図とキャプションの表示
- 表示設定（文字サイズ、行間、テーマ）
- 読書位置の自動保存と復元
- 検索機能（⌘F）

## ディレクトリ構成

```
paper-reader/
├── src/
│   ├── components/
│   │   ├── library/        # ライブラリ画面
│   │   ├── reader/         # リーダー画面
│   │   ├── import/         # インポート画面
│   │   └── settings/       # 設定モーダル
│   ├── services/
│   │   ├── translation/    # 翻訳エンジン
│   │   │   ├── types.ts
│   │   │   ├── madladEngine.ts
│   │   │   └── translationQueue.ts
│   │   ├── llm/            # LLMプロバイダー
│   │   │   ├── types.ts
│   │   │   ├── ollamaProvider.ts
│   │   │   └── glossaryService.ts
│   │   ├── database.ts
│   │   ├── pdfService.ts
│   │   ├── structureService.ts
│   │   └── importServiceV2.ts
│   ├── stores/
│   │   └── appStore.ts
│   ├── types/
│   │   └── paper.ts
│   └── App.tsx
├── translation-server/     # MADLAD翻訳サーバー
│   ├── engines/
│   │   ├── base.py
│   │   └── madlad.py
│   ├── server.py
│   └── requirements.txt
└── README.md
```

## ベンチマーク

翻訳性能は自動的に記録されます。

```
model: google/madlad400-3b-mt
input_chars: 1234
input_tokens: 456
output_chars: 567
translation_time_ms: 1234.5
chars_per_sec: 1000.0
tokens_per_sec: 369.8
```

## 注意事項

- **メモリ使用量**: MADLAD翻訳サーバーは約8〜10GBのメモリを使用します
- **初回起動**: モデルダウンロードに10〜20分かかります
- **対応PDF**: デジタル生成された英語論文PDFに対応。スキャンPDFは未対応

## 今後の予定

- [ ] MLXによるMADLAD高速化
- [ ] MADLAD-400 7Bのサポート
- [ ] TauriによるmacOSアプリ化
- [ ] OCR対応（スキャンPDF）

## ライセンス

Private（未定）
