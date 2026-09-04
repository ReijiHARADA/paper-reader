# Paper Reader

## Tauri macOS アプリ

- `src-tauri/` が Tauri v2 のシェル。`npm run tauri:dev` で開発、`npm run tauri:build` で `.app` + `.dmg` を生成。
- 生成物: `src-tauri/target/release/bundle/macos/Paper Reader.app`
- Xcode は `/Applications/Xcode-beta.app` を使用。ビルド時は `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer` を設定すること。
- 翻訳サーバーは Tauri の `tauri-plugin-shell` でサイドカー起動。アプリ終了時に自動停止。
- リリースビルド前に `bash scripts/bundle-python.sh` を実行して `.venv` → `translation-server/venv/` にコピーする。フルリリースでは `beforeBuildCommand` で回す。画面確認だけの再ビルドでは Python コピーを省略してよい。
- 本番 CSP は WKWebView で Vite の ES module が止まるため、いまは `null`。再導入するときは `script-src` を nonce だけにしない。
- PDF 解析は **pdfjs-dist 3.11（legacy build）**。6.x は WKWebView で Iterator Helpers が無く即クラッシュするので上げない。日本語 CID フォントは `pdfjs-dist/cmaps`（Adobe-Japan1 など）をアプリに同梱してデコードする。

## OCR（スキャン PDF 対応）

- Apple Vision Framework を Rust から呼び出す Tauri コマンド `ocr_image` を実装済み（`src-tauri/src/ocr.rs`）。
- `src/services/ocrService.ts` がフロントエンド側のラッパー。`isTauriApp()` で Tauri 環境を判定し、非 Tauri では「デスクトップ版のみ」と案内する。
- `importServiceV2.ts` がスキャン判定（1ページ平均テキストアイテム < 10）→ OCR 自動実行 → pdfResult に結果を上書きする流れを実装済み。
- OCR 言語は `["en-US", "ja-JP"]` を既定値として渡している（Vision が自動検出）。

## Translation

- Production engine is **MADLAD-400 3B on MPS + bfloat16**. Do not switch the default to CPU or to community MLX INT8.
- Sentence-level `generate()` calls are batched (default 24). Set `MADLAD_BATCH_SIZE=1` to restore one call per chunk.
- Concurrent `/translate` requests are coalesced by `MicroBatchScheduler` (25ms window). `generate()` stays single-threaded. Disable with `MADLAD_MICROBATCH=0`.
- Frontend translation concurrency default is 8 so requests can share a batch; this is not parallel Metal generate.
- Batching measurements: `translation-server/MPS_BATCH_OPTIMIZATION_REPORT.md`.
- Do not run `update_python_env.sh` unless the 3.12 venv is broken.
- Restart the server with `./restart-translation-server.sh`.
- Speed measurements and rejected alternatives live in `translation-server/SPEED_BENCH.md`.
- MLX bf16 (unquantized official 3B) was measured in `translation-server/MLX_BF16_BENCH_REPORT.md`. Do not switch production to it: quality matches MPS, but it is not 1.5–2× faster than the batched MPS path.

## Local data

- Original PDFs are copied to the Tauri app data directory as `papers/<paperId>/source.pdf`. They are not stored in IndexedDB.
- Annotations live in IndexedDB (`annotations` store) and stay on-device.
- Assign papers to a Project by dragging a library card onto the sidebar item. Drag onto Inbox to remove all project memberships. Do not use HTML5 drag-and-drop for this: WKWebView often starts a drag but never fires `drop`. Use pointer tracking and `elementFromPoint`.
- Import a PDF by dropping it onto the app window. Use Tauri `onDragDropEvent` in the desktop app (HTML5 `drop` does not receive files in WKWebView). Browser `npm run dev` can keep HTML5 file drop. A drop on `/project/:id` attaches the paper to that project.
- Project delete lives on the project screen header (trash icon), not beside the sidebar name. Deleting a project removes memberships only; paper records stay, and unassigned papers reappear in Inbox. The “論文を追加” button sits in the header next to the title on Project, All Papers, and Inbox.
- Reading-order regression fixtures: `test-fixtures/` (synthetic PDFs only). Real papers from the jewelry-first-computing index live in gitignored `test-data/real-papers/` (`npm run fetch:real-papers`). Do not copy those PDFs into the repo or edit jewelry-first-computing.
- Academic PDF extraction research: `ACADEMIC_PDF_EXTRACTION_RESEARCH.md`. `src/services/pdfExtraction/` is a PoC (Format Profile, page class, GROBID TEI, fusion). Do not wire it into `importServiceV2` until a later, measured production change. Do not use `catalog.json` `formatFamily` for production format detection. Do not fix one broken PDF by adding a one-off `if` in `pdfLayout.ts`. Do not upgrade pdfjs-dist to 6.x.
- Dotted grant identifiers (`016.128.303`) are not section headings or paper titles. Wrap them into the preceding `grant number` paragraph. Latin-ratio quality checks ignore source proper nouns and numeric ids.
- After any product or behavior change, update `README.md` and `ROADMAP.md` in the same turn so they match the current code. Move finished work out of ROADMAP section 3. Put remaining gaps only. Update `QUICKSTART.md` or `AGENTS.md` when launch steps or constraints change.
