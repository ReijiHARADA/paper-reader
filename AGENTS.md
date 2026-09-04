# Paper Reader

## Tauri macOS アプリ

- `src-tauri/` が Tauri v2 のシェル。`npm run tauri:dev` で開発、`npm run tauri:build` で `.app` + `.dmg` を生成。
- 生成物: `src-tauri/target/release/bundle/macos/Paper Reader.app`
- Xcode は `/Applications/Xcode-beta.app` を使用。ビルド時は `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer` を設定すること。
- 翻訳サーバーは Tauri の `tauri-plugin-shell` でサイドカー起動。アプリ終了時に自動停止。
- リリースビルド前に `bash scripts/bundle-python.sh` を実行して `.venv` → `translation-server/venv/` にコピーする（`beforeBuildCommand` に組み込み済み）。
- PDF 解析は **pdfjs-dist 3.11（legacy build）**。6.x は WKWebView で Iterator Helpers が無く即クラッシュするので上げない。

## OCR（スキャン PDF 対応）

- Apple Vision Framework を Rust から呼び出す Tauri コマンド `ocr_image` を実装済み（`src-tauri/src/ocr.rs`）。
- `src/services/ocrService.ts` がフロントエンド側のラッパー。`isTauriApp()` で Tauri 環境を判定し、非 Tauri では「デスクトップ版のみ」と案内する。
- `importServiceV2.ts` がスキャン判定（1ページ平均テキストアイテム < 10）→ OCR 自動実行 → pdfResult に結果を上書きする流れを実装済み。
- OCR 言語は `["en-US", "ja-JP"]` を既定値として渡している（Vision が自動検出）。

## Translation

- Production engine is **MADLAD-400 3B on MPS + bfloat16**. Do not switch the default to CPU or to community MLX INT8.
- Sentence-level `generate()` calls are batched (default 8). Set `MADLAD_BATCH_SIZE=1` to restore one call per chunk.
- Do not run `update_python_env.sh` unless the 3.12 venv is broken.
- Restart the server with `./restart-translation-server.sh`.
- Speed measurements and rejected alternatives live in `translation-server/SPEED_BENCH.md`.
