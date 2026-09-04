import { describe, expect, it } from "vitest";
import { analyzeStructure } from "../../services/structureService";
import { extractFromPages } from "../../services/pdfExtraction/pipeline/extractAcademicPdf";
import { FIXTURES } from "../readingOrder/builders";
import { grobidEnricher } from "../../services/pdfExtraction/enrichers/grobid";
import { doclingEnricher } from "../../services/pdfExtraction/enrichers/docling";
import { nativeDocumentFromExtracted } from "../../services/pdfExtraction/native/fromExtracted";

describe("canonical extraction pipeline", () => {
  it("projects Japanese conference headings with CHILD_OF parents", () => {
    const pages = FIXTURES["japanese-conference"]();
    const result = extractFromPages({
      pages,
      paperId: "ja",
      filePath: "/tmp/ja.pdf",
      fileHash: "h",
      metadata: { pageCount: 1 },
    });
    expect(result.paper.titleOriginal).toMatch(/情報採餌理論/);
    const intro = result.sections.find((s) => /1 はじめに/.test(s.originalTitle));
    const sub = result.sections.find((s) => /2\.1/.test(s.originalTitle));
    expect(intro).toBeTruthy();
    expect(sub?.parentSectionId).toBe(intro?.id);
    expect(result.canonical.relations.some((r) => r.kind === "CHILD_OF")).toBe(true);
    expect(result.canonical.relations.some((r) => r.kind === "READS_BEFORE")).toBe(true);
    expect(result.canonical.relations.some((r) => r.kind === "CAPTION_OF")).toBe(true);
    expect(result.blocks.some((b) => b.type === "figure")).toBe(true);
    expect(result.blocks[0]?.metadata.sourceAnchor).toBeTruthy();
    expect(result.blocks[0]?.metadata.evidence).toBeTruthy();
  });

  it("keeps analyzeStructure as a projection wrapper", () => {
    const pages = FIXTURES["classification-index"]();
    const viaWrapper = analyzeStructure(pages, "p", "/tmp/c.pdf", "h", { pageCount: 1 });
    const viaPipeline = extractFromPages({
      pages,
      paperId: "p",
      filePath: "/tmp/c.pdf",
      fileHash: "h",
      metadata: { pageCount: 1 },
    });
    expect(viaWrapper.paper.titleOriginal).toBe(viaPipeline.paper.titleOriginal);
    expect(viaWrapper.blocks.map((b) => b.type)).toEqual(
      viaPipeline.blocks.map((b) => b.type)
    );
  });

  it("does not run GROBID or Docling without a local service", () => {
    const pages = FIXTURES["single-column"]();
    const native = nativeDocumentFromExtracted(pages, { pageCount: 1 });
    const ctx = { native, pages };
    expect(grobidEnricher.shouldRun(ctx)).toBe(false);
    expect(doclingEnricher.shouldRun(ctx)).toBe(false);
  });
});
