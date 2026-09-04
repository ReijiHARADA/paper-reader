# Academic PDF Extraction Architecture

Production architecture for Paper Reader. Research background: [ACADEMIC_PDF_EXTRACTION_RESEARCH.md](./ACADEMIC_PDF_EXTRACTION_RESEARCH.md).

Source of Truth is **CanonicalDocument**, not pdfLayout, GROBID, Docling, OCR, or a Format Profile.

Paper / Section / PaperBlock are a **projection** for the existing reader, translation queue, and annotations.

## Pipeline

```
Source PDF
    → Native PDF Extraction (pdf.js 3.11 + CMap)
    → NativeDocument          // facts only, no semantic roles
    → Page Classification     // native-text | scanned | garbled | mixed
    → OCR fallback            // Vision, scanned/garbled pages only
    → Generic Heuristics      // pdfLayout as evidence generator
    → Format Detection        // precision-first; else generic
    → Format Profile          // evidence + hard rules if applied
    → Optional Enrichers      // GROBID / Docling when confidence is low
    → Document Resolver
    → CanonicalDocument
    → projectCanonicalToPaper
    → Paper / Section / PaperBlock
    → existing Translation / Reader / Annotation
```

Entry point: `extractAcademicPdf()` (async, File) and `extractFromPages()` (sync, tests).

Import calls only `extractAcademicPdf`. It does not contain column, title, author, figure, or OCR heuristics.

## Responsibilities

| Layer | Owns | Does not own |
|---|---|---|
| NativeDocument | pdf.js strings, bbox, font, metadata | title / heading / paragraph |
| Page classifier | page kind + OCR necessity | final roles |
| Generic (`pdfLayout.ts`) | lines, columns, left→right order, role **candidates** | Canonical roles |
| Format Profile | extra evidence + chrome hard rules after detection | parsing the whole PDF |
| Enrichers | optional extra evidence | replacing native text |
| DocumentResolver | final roles, confidence, relations | UI / DB schema |
| Projection | Paper reader records | re-parsing PDF |

## CanonicalDocument

- `nodes[]` with role, native `text`, bbox, `confidence`, `evidence[]`, `sourceAnchor`
- `relations[]`: `READS_BEFORE`, `CHILD_OF`, `CAPTION_OF`, `AFFILIATED_WITH`
- `format`: detection scores and applied id
- `diagnostics`: layout, reading order, text integrity, semantic, format, relation (legacy column/unicode/paragraph aliases kept)

Roles are decided only in the Resolver.

## Evidence

```ts
type ExtractionEvidence = {
  source: "pdf-native" | "generic-heuristic" | "format-profile" | "ocr" | "grobid" | "layout-model";
  label: string;
  confidence: number;
  reason?: string;
  page?: number;
  bbox?: BoundingBox;
};
```

Native text is never replaced by GROBID/VLM/OCR when the pdf.js layer is healthy.

## Format Profile

Profiles are not alternate parsers. They add evidence and, **after** a confident detection, hard-rule chrome (ACM permission boilerplate, IEEE licensed-use footer).

Detection stays conservative:

- `APPLY_MIN = 0.75`
- `APPLY_MARGIN = 0.12`
- Precision over recall. Ambiguous → `generic`.

Catalog `formatFamily` is benchmark Ground Truth only.

## Fallback cascade

1. Native + Generic + Format Profile. If overall confidence is high, stop.
2. Header/semantic weak → GROBID enricher (`GROBID_URL` local only).
3. Layout/reading-order weak → Docling enricher (stub; not bundled).
4. Scanned/garbled pages → Apple Vision OCR **before** generic parse.

GROBID and Docling are not production dependencies.

## Relations → Projection

- `READS_BEFORE` is a path over readable nodes. Projection topological-sorts; on a cycle it falls back to generic order.
- `CHILD_OF` uses numbering prefixes, then a level stack. Projection writes `Section.parentSectionId`.
- `CAPTION_OF` links caption nodes to figure/table region nodes. Projection still emits one figure/table `PaperBlock` (caption text + metadata), matching the reader.
- `AFFILIATED_WITH` uses superscript/symbol markers, then 1-to-many or positional fallback. `Paper.authors` remains a flat projection.

## Directory

```
src/services/pdfExtraction/
  pipeline/extractAcademicPdf.ts
  native/
  page/
  generic/          # facade over pdfLayout.ts
  formats/
  resolver/
  canonical/
  projection/toPaper.ts
  enrichers/        # ocr, grobid, docling
```

`pdfLayout.ts` is kept as the generic algorithm kernel so column order is not rewritten during the move. `structureService.analyzeStructure` is a compatibility wrapper around `extractFromPages`.
