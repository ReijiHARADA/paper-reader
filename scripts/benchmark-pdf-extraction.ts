/**
 * Baseline academic-PDF extraction benchmark. Does not change import.
 *
 *   npx tsx scripts/benchmark-pdf-extraction.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reconstructDocument } from "../src/services/pdfLayout.ts";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { evaluateBaselinePaper } from "../src/services/pdfExtraction/benchmark.ts";
import type { PartialGroundTruth } from "../src/services/pdfExtraction/benchmark.ts";

type CatalogPaper = {
  id: string;
  title: string;
  filename: string;
  formatFamily?: string;
  checks: { tokensInOrder?: string[]; captionContains?: string[]; tableCaptionContains?: string[] };
};

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")
) as { pdfDir: string; papers: CatalogPaper[] };

const reports = [];
for (const paper of catalog.papers) {
  const pdfPath = path.join(root, catalog.pdfDir, paper.filename);
  if (!fs.existsSync(pdfPath)) continue;
  const pages = await extractPdfPages(pdfPath);
  const { blocks } = reconstructDocument(pages);
  const gtPath = path.join(
    root,
    "test-fixtures/real-papers/ground-truth",
    `${paper.id}.json`
  );
  const gt = fs.existsSync(gtPath)
    ? (JSON.parse(fs.readFileSync(gtPath, "utf8")) as PartialGroundTruth)
    : undefined;
  reports.push(
    evaluateBaselinePaper({
      id: paper.id,
      filename: paper.filename,
      pages,
      blocks,
      catalogFormatFamily: paper.formatFamily,
      catalogTitle: paper.title,
      groundTruth: gt ?? { id: paper.id, title: paper.title },
    })
  );
}

const titleHits = reports.filter((r) => r.titleExact === true).length;
const titleKnown = reports.filter((r) => r.titleExact !== undefined).length;
console.log(
  JSON.stringify(
    {
      papers: reports.length,
      titleExact: titleKnown === 0 ? null : titleHits / titleKnown,
      reports,
    },
    null,
    2
  )
);
