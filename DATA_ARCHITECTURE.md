# Paper Reader Data Architecture

Production persistence for Paper Reader. Extraction internals remain in
[ACADEMIC_PDF_EXTRACTION_ARCHITECTURE.md](./ACADEMIC_PDF_EXTRACTION_ARCHITECTURE.md).

This document is the source of truth for **where data lives** and **what
anchors it**. Reader UI, translation, and annotations consume repositories —
not IndexedDB object stores, pdfLayout internals, or GROBID TEI.

## 1. Design goals

- A paper is a portable **Paper Package** on disk.
- Humans read **Markdown**. PDF correspondence lives in **structure / layout**.
- Relations, search, annotations, and app state live in **SQLite**.
- The original file is **source.pdf**.
- **Stable block IDs** are the cross-cutting anchor.
- Existing IndexedDB v4 libraries migrate without data loss.
- Do not push everything into Markdown. Do not keep paper bodies only in a DB.

## 2. Source of Truth

| Concern | Authority | Not authority |
|---|---|---|
| Original PDF | `papers/<paperId>/source.pdf` | copies inside Project folders |
| Bibliographic metadata | `paper.json` | SQLite `papers` row (index only) |
| Readable original | `original.md` | IndexedDB `blocks.original` |
| Readable translation | `ja.md` | IndexedDB `blocks.translated` |
| PDF provenance (block / line) | `structure.json` | Markdown comments |
| Span / glyph geometry | `layout.json.gz` | `structure.json` |
| Figures / tables / equation images | `assets/` | IndexedDB data URLs |
| Paper ↔ Project, folders, annotations, FTS, cache | SQLite `library.sqlite` | Paper Package |
| Runtime reading | Document AST | raw Markdown string alone |

SQLite can be rebuilt from Paper Packages (plus workspace / annotation rows).
Paper Packages cannot be rebuilt from SQLite alone.

## 3. Paper Package

App Data:

```text
<AppData>/
├── library.sqlite
└── papers/
    └── <paperId>/
        ├── source.pdf
        ├── paper.json
        ├── original.md
        ├── ja.md
        ├── structure.json
        ├── layout.json.gz      # optional sidecar
        └── assets/
            ├── figure-001.png
            └── table-001.png
```

`paper.json` holds bibliography, authors, affiliations, DOI, hash, timestamps.
It does **not** duplicate body text.

Writes use `tmp → write → validate → atomic rename`. Each package has
`schemaVersion` and `revision`.

## 4. Markdown convention

Paper Reader Markdown = GFM + YAML front matter + a small comment convention.

```markdown
---
paperId: "…"
language: "en"
schemaVersion: 1
---

# Title

<!-- pr:block id="b-001" -->

## Abstract

<!-- pr:block id="b-002" -->

Paragraph text.

<!-- pr:block id="b-003" -->

![Figure 1](assets/figure-001.png)

<!-- pr:block id="b-004" -->

*Figure 1. System overview.*

<!-- pr:block id="b-005" -->

Previous work [12](#ref-smith-2024).

<!-- pr:block id="b-006" -->

$$
E = mc^2
$$

<!-- pr:block id="b-007" -->

---

> [!NOTE]
> Optional callout.

<!-- pr:block id="b-008" -->

<a id="ref-smith-2024"></a>

12. Smith, J. …

<!-- pr:block id="b-009" -->
```

Rules:

- `<!-- pr:block id="…" -->` binds to the **preceding** block-level node.
- `original.md` and `ja.md` share the same block IDs (`b-002` is the same unit).
- Export can strip internal comments. Reader and export share one serializer.
- Annotations are **not** embedded in the canonical Markdown.

## 5. Stable block ID

Block IDs anchor annotation, original↔translation, PDF bbox, citations,
reading position, export, and re-translation.

- New extracts use deterministic IDs (`b-` + content fingerprint).
- Re-extract **reconciles** old ↔ new via normalized text, page, bbox,
  section, prefix/suffix, and neighbors. IDs are not blindly re-UUIDed.
- Migration **keeps** existing IndexedDB block IDs.

Optional future `segmentId` on a block enables sentence alignment. Not required now.

## 6. structure.json

Block- and line-level PDF provenance. No full paper text.

```json
{
  "schemaVersion": 1,
  "blocks": {
    "b-002": {
      "type": "paragraph",
      "pageStart": 1,
      "pageEnd": 1,
      "boundingBoxes": [{ "page": 1, "x": 72, "y": 180, "width": 220, "height": 96 }],
      "column": "left",
      "extractionConfidence": 0.94,
      "evidence": [{ "source": "pdf-native", "confidence": 1 }],
      "lines": [
        { "text": "Recent advances", "bbox": { "page": 1, "x": 72, "y": 180, "width": 220, "height": 12 }, "baseline": 190, "fontSize": 10 }
      ]
    }
  },
  "relations": [
    { "type": "CAPTION_OF", "from": "b-005", "to": "b-004" }
  ],
  "references": {
    "ref-smith-2024": {
      "blockId": "b-009",
      "number": "12",
      "rawText": "12. Smith, J. …",
      "doi": null,
      "url": null
    }
  }
}
```

Relation kinds stored today: `READS_BEFORE`, `CHILD_OF`, `CAPTION_OF`,
`CITES`, `CONTINUES`, `ALIGNED_WITH`, `AUTHOR_AFFILIATED_WITH`.
The UI does not have to consume every kind.

## 7. Layout provenance

`layout.json.gz` holds span-level geometry for a future translated-layout PDF.

- Block / line → `structure.json`
- Span (text, bbox, font, size, style) → `layout.json.gz`

The exporter itself is out of scope. Import must not drop page, bbox, column,
reading order, line baseline, or native spans.

Future pipeline:

```text
source.pdf + ja.md + structure.json + layout.json.gz
  → reflow Japanese into original text regions
  → keep figures / tables / equations
  → translated-layout.pdf
```

## 8. SQLite schema

**Engine:** [sql.js](https://github.com/sql-js/sql.js) (SQLite WASM with FTS5),
persisted as `<AppData>/library.sqlite`.

Why not `tauri-plugin-sql` as the only engine:

- The same schema must run in vitest and in `npm run dev` (no Rust runtime).
- Paper bodies are **not** stored in SQLite, so an in-memory WASM DB that
  flushes a small file is enough.
- Official sql.js may not ship FTS5; the client creates FTS5 when
  available and otherwise uses a rebuildable LIKE index.
- A `SqliteClient` interface keeps a later native swap possible.

Production persist: Tauri writes the sqlite bytes next to `papers/`.
Browser preview: the same file map is stored as a fallback blob (not the
legacy `papers` / `sections` / `blocks` object stores).

Tables:

- `meta` — schema version, migration marks
- `papers` — library index (no body)
- `workspace_nodes` — folder / project tree
- `projects` — project-only metadata
- `project_papers` — many-to-many membership (paper is not copied)
- `annotations` — block-anchored notes
- `reading_positions` — `paperId + blockId + offset`
- `glossaries`, `translation_cache`, `translation_jobs`, `settings`, `benchmarks`
- `papers_fts` — FTS5 cache; rebuildable from packages + annotations

## 9. Workspace tree

```text
Folder
├ Folder
│  ├ Project
│  └ Project
└ Project
```

- Folder: organization only. No paper membership.
- Project: leaf. Holds `project_papers`. Project-inside-project is rejected
  so inheritance of papers stays undefined.
- Folders nest without a depth limit.
- Safety: no cycles, no move under self, sibling order, confirm delete when
  a folder has children.

## 10. Annotation

Stored in SQLite, never in Markdown.

Fields: `paperId`, `blockId`, `startOffset`, `endOffset`, `selectedText`,
`prefix`, `suffix`, `note`, `projectId`, status.

Re-anchor uses the existing `annotationAnchor` rules. Canonical export omits
notes. Annotated export can wrap notes as `> [!NOTE]` later.

## 11. References

Display number (`12`) and stable `referenceId` (`ref-smith-2024`) are separate.

- Body: `[12](#ref-smith-2024)` only when the target is unique.
- Bibliography: `<a id="ref-smith-2024"></a>` plus the raw entry.
- Ambiguous or missing targets are **not** linked.
- DOI / publisher URL become normal Markdown links when known.
- Future translated-layout PDF can turn the same IDs into PDF link annotations.

## 12. Migration

IndexedDB `paper-reader` v4 remains readable until a later cleanup.

1. Read IDB papers / sections / blocks / projects / links / annotations /
   glossaries / cache / settings / benchmarks.
2. Build a Paper Package per paper (`original.md`, `ja.md`, `paper.json`,
   `structure.json`). Rewrite figure/table data URLs into `assets/`.
3. Keep existing `source.pdf`.
4. Projects become root `workspace_nodes` (`kind=project`, `parentId=null`).
5. Copy annotations with the same block IDs.
6. Validate. Mark `meta.migration_idb_v4=done`.
7. Do **not** delete IDB. Re-run is idempotent (no duplicate papers or links).

## 13. Atomic writes

Package persist:

1. Write a complete tree under `papers/<id>.tmp/`.
2. Validate Markdown ↔ structure ↔ assets ↔ original/ja alignment.
3. Rename current → `.bak`, tmp → current, remove `.bak`.
4. Bump `revision`.

A crash mid-write leaves either the previous package or a tmp that is ignored.

## 14. Export architecture

```text
Document AST  →  serializeMarkdown()  →  Reader
                                   ↘  export (optional: strip pr:block comments)
```

There is no second “export-only” generator.

Default export:

```text
paper-title/
├── paper.md      # usually ja.md structure
└── assets/
```

Canonical export has no annotations. Annotated Markdown export is a later
pass over the same AST.

## 15. Future translated-layout PDF

Not implemented. Required inputs are stored at extract time:

- `source.pdf`
- `ja.md` (same block IDs)
- `structure.json` (page, bbox, column, reading order, lines)
- `layout.json.gz` (spans)

## 16. Schema versioning

| Surface | Field | Current |
|---|---|---|
| Paper Package / `paper.json` | `schemaVersion` | 1 |
| `structure.json` | `schemaVersion` | 1 |
| Markdown front matter | `schemaVersion` | 1 |
| SQLite `meta.schema_version` | integer | 1 |
| IndexedDB (legacy backup) | `paper-reader` | 4 |

Bump the matching version and add a migrator. Do not silently rewrite
on-disk packages.

## Repository boundary

```text
UI / stores
  → PaperRepository / DocumentRepository / WorkspaceRepository
    / AnnotationRepository / SettingsRepository
      → Filesystem + SQLite
```

No factories or abstract base repositories. `src/services/database.ts` is a
compatibility façade used by existing import / reader / test call sites.
)
