# MADLAD Translation Server

Paper Reader 用のローカル翻訳サーバーです。**MADLAD-400 3B** を Apple Silicon の **MPS + bfloat16** で動かし、英語→日本語を返します。

速度の実測と、MLX INT8 を不採用にした理由は [SPEED_BENCH.md](./SPEED_BENCH.md) にあります。

## 要件

- Python 3.12（`uv` が入れる公式ビルドを推奨。Homebrew `python@3.12` は macOS 26 で venv が壊れやすい）
- Apple Silicon Mac（推奨 24GB 以上）
- ディスク: 依存関係 + 初回モデルでおおよそ 12GB

## セットアップ

```bash
cd translation-server
uv python install 3.12
uv venv --python 3.12 .venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

仮想環境ディレクトリは **`.venv`** です。ルートの `./restart-translation-server.sh` もここを見ます。

## 起動

リポジトリルートから:

```bash
./restart-translation-server.sh
```

または:

```bash
cd translation-server
source .venv/bin/activate
export PYTORCH_ENABLE_MPS_FALLBACK=1
python server.py
```

待ち受けは `http://127.0.0.1:8765` です。ポートは `MADLAD_SERVER_PORT` または `UVICORN_PORT` で変えられます。

Tauri アプリから起動する場合も同じポートです。

## 本番設定

- デバイス: MPS。未対応演算だけ `PYTORCH_ENABLE_MPS_FALLBACK=1` で CPU へ
- dtype: bfloat16
- 文バッチ: `MADLAD_BATCH_SIZE`（既定 8）。`1` で文ごとの逐次 `generate()`
- コミュニティ MLX INT8 には切り替えない（長い段落で訳が途中切れする）

## API

### ヘルスチェック

```bash
curl http://127.0.0.1:8765/health
```

### 単一翻訳

```bash
curl -X POST http://127.0.0.1:8765/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, world!", "source_language": "en", "target_language": "ja"}'
```

### バッチ翻訳

```bash
curl -X POST http://127.0.0.1:8765/translate/batch \
  -H "Content-Type: application/json" \
  -d '{"texts": ["Hello", "World"], "source_language": "en", "target_language": "ja"}'
```

### モデル管理

```bash
curl -X POST http://127.0.0.1:8765/load
curl -X POST http://127.0.0.1:8765/unload
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

## 注意

- 初回翻訳で Hugging Face からモデルを取得します（約 6GB）
- ロードに数十秒かかることがあります
- 実行中のメモリはおおよそ 8–10GB です
