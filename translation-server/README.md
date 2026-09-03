# MADLAD Translation Server

ローカル翻訳サーバー。MADLAD-400 3Bモデルを使用して英語→日本語翻訳を提供します。

## 要件

- Python 3.10以上
- M4 MacBook Pro / 24GB RAM推奨
- ディスク容量: 約12GB（モデル + 依存関係）

## セットアップ

```bash
cd translation-server

# 仮想環境を作成
python3 -m venv venv
source venv/bin/activate

# 依存関係をインストール
pip install -r requirements.txt
```

## 起動

```bash
source venv/bin/activate
python server.py
```

サーバーは `http://127.0.0.1:8765` で起動します。

## API

### ヘルスチェック

```bash
curl http://127.0.0.1:8765/health
```

### 翻訳（単一）

```bash
curl -X POST http://127.0.0.1:8765/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, world!", "source_language": "en", "target_language": "ja"}'
```

### 翻訳（バッチ）

```bash
curl -X POST http://127.0.0.1:8765/translate/batch \
  -H "Content-Type: application/json" \
  -d '{"texts": ["Hello", "World"], "source_language": "en", "target_language": "ja"}'
```

### モデル管理

```bash
# モデルを読み込み
curl -X POST http://127.0.0.1:8765/load

# モデルをアンロード
curl -X POST http://127.0.0.1:8765/unload

# ステータス確認
curl http://127.0.0.1:8765/status
```

## レスポンス例

```json
{
  "text": "こんにちは、世界！",
  "source_language": "en",
  "target_language": "ja",
  "model": "google/madlad400-3b-mt",
  "model_version": "3b-mt",
  "input_chars": 13,
  "output_chars": 9,
  "input_tokens": 7,
  "output_tokens": 5,
  "translation_time_ms": 245.5,
  "chars_per_sec": 52.9,
  "tokens_per_sec": 28.5
}
```

## 注意事項

- 初回翻訳時にモデルがダウンロードされます（約6GB）
- モデル読み込みに30〜60秒かかります
- メモリ使用量: 約8〜10GB
