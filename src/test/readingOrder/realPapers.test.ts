import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { reconstructDocument, isFigureCaption } from "../../services/pdfLayout";
import { extractPdfPages } from "./extractPdf";

type CatalogPaper = {
  id: string;
  title: string;
  filename: string;
  checks: {
    expectMultiColumnOnPages?: number[];
    tokensInOrder?: string[];
    tokensInOrderPage?: number;
    headingContains?: string[];
    captionContains?: string[];
    tableCaptionContains?: string[];
    forbidSameParagraph?: [string, string][];
    forbidCaptionInParagraph?: boolean;
    referencesHeading?: boolean;
    titleContains?: string;
    mostlySingleColumn?: boolean;
  };
};

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")
) as { pdfDir: string; papers: CatalogPaper[] };
const pdfDir = path.join(root, catalog.pdfDir);

function availablePapers(): { paper: CatalogPaper; pdfPath: string }[] {
  return catalog.papers.flatMap((paper) => {
    const pdfPath = path.join(pdfDir, paper.filename);
    return fs.existsSync(pdfPath) ? [{ paper, pdfPath }] : [];
  });
}

describe("real jewelry-corpus PDFs", () => {
  const papers = availablePapers();

  it("has at least one cached real paper when the corpus was fetched", () => {
    if (papers.length === 0) {
      console.warn(
        "No real papers in test-data/real-papers. Run: node scripts/fetch-real-papers.mjs"
      );
    }
    expect(true).toBe(true);
  });

  for (const { paper, pdfPath } of papers) {
    it(`${paper.id} reading-order checks`, async () => {
      const pages = await extractPdfPages(pdfPath);
      const { blocks, layouts } = reconstructDocument(pages);
      const checks = paper.checks;
      const headings = blocks.filter((b) => b.role === "heading").map((b) => b.text);
      const captions = blocks
        .filter((b) => b.role === "figure_caption")
        .map((b) => b.text);
      const tables = blocks
        .filter((b) => b.role === "table_caption")
        .map((b) => b.text);
      const paragraphs = blocks.filter((b) => b.role === "paragraph").map((b) => b.text);
      const titles = blocks.filter((b) => b.role === "title").map((b) => b.text);

      for (const pageNum of checks.expectMultiColumnOnPages ?? []) {
        expect(layouts[pageNum - 1]?.isMultiColumn, `page ${pageNum} 2-column`).toBe(true);
      }

      if (checks.mostlySingleColumn) {
        const multi = layouts.filter((l) => l.isMultiColumn).length;
        expect(multi / Math.max(layouts.length, 1)).toBeLessThan(0.45);
      }

      if (checks.tokensInOrder) {
        const page = checks.tokensInOrderPage;
        const haystack = blocks
          .filter((b) => (page ? b.pageStart === page : true))
          .map((b) => b.text)
          .join("\n");
        let from = 0;
        for (const token of checks.tokensInOrder) {
          const idx = haystack.toLowerCase().indexOf(token.toLowerCase(), from);
          expect(idx, token).toBeGreaterThanOrEqual(0);
          from = idx + token.length;
        }
      }

      for (const heading of checks.headingContains ?? []) {
        expect(headings.some((h) => h.toLowerCase().includes(heading.toLowerCase()))).toBe(
          true
        );
      }

      for (const caption of checks.captionContains ?? []) {
        expect(captions.some((c) => c.includes(caption))).toBe(true);
      }

      for (const caption of checks.tableCaptionContains ?? []) {
        expect(tables.some((c) => c.includes(caption))).toBe(true);
      }

      if (checks.titleContains) {
        const blob = [
          ...titles,
          ...headings.slice(0, 6),
          ...blocks.slice(0, 12).map((b) => b.text),
        ].join(" ");
        expect(blob.toLowerCase()).toContain(checks.titleContains.toLowerCase());
      }

      if (checks.referencesHeading) {
        expect(
          headings.some((h) => /references/i.test(h)) ||
            blocks.some((b) => /^(?:\d+[.)]\s*)?references\b/i.test(b.text.trim()))
        ).toBe(true);
      }

      for (const [a, b] of checks.forbidSameParagraph ?? []) {
        expect(
          paragraphs.some((p) => p.includes(a) && p.toLowerCase().includes(b.toLowerCase()))
        ).toBe(false);
      }

      if (checks.forbidCaptionInParagraph) {
        expect(paragraphs.some((p) => isFigureCaption(p))).toBe(false);
      }
    }, 60_000);
  }
});
