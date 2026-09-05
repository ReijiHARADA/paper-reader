# Paper Reader

## Tauri macOS アプリ

- UI を変えたら `npm run dev` を上げ、`npm run verify:browser` で Library / 設定 / Reader を実ブラウザ確認する。このセッションの Cursor に Browser MCP は無いので Playwright（`@playwright/test`）を使う。翻訳サーバーは `http://127.0.0.1:8765/health`。
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
- OCR 言語は `["en-US", "ja-JP"]` を既定値として渡している（Vision が自動検出）。
- スキャン判定は `extractAcademicPdf` 内の Page Classification（平均 item < 10 の baseline + garbled/mixed）。ImportService には OCR heuristic を置かない。

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

- Paper body source of truth is the Paper Package at `<AppData>/papers/<paperId>/` (`source.pdf`, `paper.json`, `original.md`, `ja.md`, `translation.json`, `structure.json`, optional `layout.json.gz`, `assets/`). Do not store paper bodies only in IndexedDB or SQLite. Keep structured authors / affiliations / DOI in `paper.json`; do not mint `author-1` when ids already exist. Block APIs take `{ paperId, blockId }`. Re-extract must `reconcileBlockIds` then remap annotations / reading position.
- During MADLAD translation, persist only `ja.md` / `paper.json` / `structure.json` on a debounce. Never rewrite `source.pdf`, `assets/`, or `layout.json.gz` per block. Full atomic persist + validation stays on finalize. Do not change MADLAD 3B / MPS / bf16 / batch 24 / microbatch / concurrency 8 to “fix” Reader jank.
- SQLite (`library.sqlite`) holds the library index, workspace tree, annotations, reading positions, glossaries, translation cache, and rebuildable FTS/LIKE search. See `DATA_ARCHITECTURE.md`.
- Zustand `useAppStore` is UI only (current paper, display settings, expanded originals). `useLibraryCache` / `useProjectStore` are in-memory query caches. Do not treat them as the document authority; persist through Paper Package / SQLite first.
- Original PDFs stay in the package as `source.pdf`. First import persist includes `sourcePdf` in the atomic Paper Package write. Do not pre-write `source.pdf` and then replace the package directory.
- SQLite schema is versioned. Add a numbered migration when changing tables. `translation_cache` PK is `(text_hash, model, model_version, source_language, target_language)`. `papers.source_file_hash` is UNIQUE. Close/exit must `flushDocumentPersist` + `db.persist()`; do not drop pending timers without writing.
- Annotations live in SQLite, anchored to stable block IDs. Re-anchor still uses selectedText + prefix + suffix.
- IndexedDB `paper-reader` v4 is a read-only backup after migration. Do not delete it in the same release that introduces the new store.
- Assign papers to a Project by dragging a library card onto the sidebar item. Drag onto Inbox to remove all project memberships. Do not use HTML5 drag-and-drop for this: WKWebView often starts a drag but never fires `drop`. Use pointer tracking and `elementFromPoint`.
- Import a PDF by dropping it onto the app window. Use Tauri `onDragDropEvent` in the desktop app (HTML5 `drop` does not receive files in WKWebView). Browser `npm run dev` can keep HTML5 file drop. A drop on `/project/:id` attaches the paper to that project. Do not navigate to `/import` as the main path; start `startBackgroundImport` and stay on Library. Show readiness (`preparing` / `readable` / `translating` / `needs_attention`) on cards, not raw processing stages. `⌘K` is library search, `⌘F` is in-paper search; focusing library search must not leave Reader.
- Project delete lives in the sidebar project's three-dot menu; do not show a duplicate trash icon in the project screen header. Deleting a project removes memberships only; paper records stay, and unassigned papers reappear in Inbox. The “論文を追加” button sits in the header next to the title on Project, All Papers, and Inbox.
- Reading-order regression fixtures: `test-fixtures/` (synthetic PDFs only). Real papers from the jewelry-first-computing index live in gitignored `test-data/real-papers/` (`npm run fetch:real-papers`). Do not copy those PDFs into the repo or edit jewelry-first-computing.
- Academic PDF extraction: CanonicalDocument is the extraction source of truth. Persist as Paper Package (Markdown + structure). Import calls `extractAcademicPdf` then writes the package. Reader consumes Document AST / projection, not pdfLayout or GROBID internals. `pdfLayout.ts` remains the generic heuristic engine (do not rewrite column left→right). Format Profile apply thresholds stay APPLY_MIN=0.75 / APPLY_MARGIN=0.12. Do not use catalog.json formatFamily for production detection. Do not upgrade pdfjs-dist to 6.x. GROBID/Docling are optional enrichers, not required dependencies. Reuse block IDs on re-extract; do not mint a fresh UUID for every block.
- Workspace: Folder organizes only. Project holds paper membership. Project-under-project is forbidden. Papers are never copied per project.
- Dotted grant identifiers (`016.128.303`) are not section headings or paper titles. Wrap them into the preceding `grant number` paragraph. Latin-ratio quality checks ignore source proper nouns and numeric ids.
- After any product or behavior change, update `README.md` and `ROADMAP.md` in the same turn so they match the current code. Move finished work out of ROADMAP section 3. Put remaining gaps only. Update `QUICKSTART.md` or `AGENTS.md` when launch steps or constraints change.
