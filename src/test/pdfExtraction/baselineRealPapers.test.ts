import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { reconstructDocument } from "../../services/pdfLayout";
import { extractPdfPages } from "../readingOrder/extractPdf";
import { evaluateBaselinePaper } from "../../services/pdfExtraction/benchmark";
import type { PartialGroundTruth } from "../../services/pdfExtraction/benchmark";

type CatalogPaper = {
  id: string;
  title: string;
  filename: string;
  formatFamily?: string;
  checks: { tokensInOrder?: string[]; captionContains?: string[]; tableCaptionContains?: string[] };
};

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")
) as { pdfDir: string; papers: CatalogPaper[] };

function loadGroundTruth(id: string): PartialGroundTruth | undefined {
  const gtPath = path.join(root, "test-fixtures/real-papers/ground-truth", `${id}.json`);
  if (!fs.existsSync(gtPath)) return undefined;
  return JSON.parse(fs.readFileSync(gtPath, "utf8")) as PartialGroundTruth;
}

describe("baseline benchmark on cached real papers", () => {
  const available = catalog.papers.flatMap((paper) => {
    const pdfPath = path.join(root, catalog.pdfDir, paper.filename);
    return fs.existsSync(pdfPath) ? [{ paper, pdfPath }] : [];
  });

  it("skips cleanly when the corpus is not cached", () => {
    if (available.length === 0) {
      console.warn("No real papers cached; baseline benchmark skipped");
    }
    expect(true).toBe(true);
  });

  for (const { paper, pdfPath } of available) {
    it(`${paper.id} baseline + format detection`, async () => {
      const pages = await extractPdfPages(pdfPath);
      const { blocks } = reconstructDocument(pages);
      const gt = loadGroundTruth(paper.id);
      const report = evaluateBaselinePaper({
        id: paper.id,
        filename: paper.filename,
        pages,
        blocks,
        catalogFormatFamily: paper.formatFamily,
        catalogTitle: paper.title,
        groundTruth: gt
          ? {
              ...gt,
              tokensInOrder:
                gt.tokensInOrder ??
                (paper.checks.tokensInOrder && paper.checks.tokensInOrder.length >= 2
                  ? [paper.checks.tokensInOrder[0], paper.checks.tokensInOrder[1]]
                  : undefined),
              figureCaptions: gt.figureCaptions ?? paper.checks.captionContains,
              tableCaptions: gt.tableCaptions ?? paper.checks.tableCaptionContains,
            }
          : {
              id: paper.id,
              title: paper.title,
              figureCaptions: paper.checks.captionContains,
              tableCaptions: paper.checks.tableCaptionContains,
            },
      });

      expect(report.pageKind === "scanned" || report.scannedByItemAverage).toBe(false);
      if (report.titleExact !== undefined) {
        expect(typeof report.titleExact).toBe("boolean");
      }
      if (paper.formatFamily === "acm-acmart" && report.formatApplied === "acm") {
        expect(report.formatScores.acm).toBeGreaterThanOrEqual(0.75);
      }
      if (paper.formatFamily === "ieee-conference" && report.formatApplied === "ieee") {
        expect(report.formatScores.ieee).toBeGreaterThanOrEqual(0.75);
      }
      if (report.formatApplied === "acm" && paper.formatFamily && paper.formatFamily !== "unknown") {
        expect(paper.formatFamily.startsWith("acm")).toBe(true);
      }
      if (report.formatApplied === "ieee" && paper.formatFamily) {
        expect(paper.formatFamily.startsWith("ieee")).toBe(true);
      }
    }, 60_000);
  }
});
