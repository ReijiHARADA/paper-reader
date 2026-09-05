import { describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../../data/fs/memoryFs";
import { projectionToPackage } from "../../data/package/fromProjection";
import { loadPaperPackage, persistPaperPackage } from "../../data/package/persist";
import { packageToProjection } from "../../data/package/toProjection";
import { validatePaperPackage } from "../../data/package/validate";
import { decodeDataUrl } from "../../data/markdown/documentAst";
import type { Paper, PaperBlock, Section } from "../../types/paper";

const now = "2026-09-05T00:00:00.000Z";

function sample() {
  const paper: Paper = {
    id: "paper-1",
    sourceFilePath: "a.pdf",
    sourceFileHash: "hash-1",
    titleOriginal: "A Study",
    titleTranslated: "研究",
    authors: ["Ada"],
    publication: null,
    year: 2026,
    pageCount: 2,
    processingStatus: "ready",
    lastReadBlockId: null,
    lastReadOffset: null,
    createdAt: now,
    updatedAt: now,
  };
  const sections: Section[] = [
    {
      id: "s-1",
      paperId: "paper-1",
      parentSectionId: null,
      order: 0,
      level: 1,
      originalTitle: "Abstract",
      translatedTitle: "概要",
      normalizedKind: "abstract",
    },
  ];
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const blocks: PaperBlock[] = [
    {
      id: "b-002",
      paperId: "paper-1",
      sectionId: "s-1",
      type: "paragraph",
      order: 0,
      pageStart: 1,
      pageEnd: 1,
      boundingBoxes: [{ page: 1, x: 72, y: 180, width: 220, height: 96 }],
      original: "Recent advances in wearable computing [12].",
      translated: "ウェアラブルコンピューティングの近年の進歩 [12]。",
      extractionConfidence: 0.94,
      translationStatus: "completed",
      parentBlockId: null,
      metadata: { column: "left" },
    },
    {
      id: "b-fig",
      paperId: "paper-1",
      sectionId: "s-1",
      type: "figure",
      order: 1,
      pageStart: 1,
      pageEnd: 1,
      boundingBoxes: [],
      original: "Figure 1. Overview.",
      translated: "図1. 概要。",
      extractionConfidence: 0.9,
      translationStatus: "completed",
      parentBlockId: null,
      metadata: {
        imageUrl: png,
        captionOriginal: "Figure 1. Overview.",
        captionTranslated: "図1. 概要。",
        figureNumber: "Figure 1",
      },
    },
    {
      id: "b-ref",
      paperId: "paper-1",
      sectionId: "s-1",
      type: "reference",
      order: 2,
      pageStart: 2,
      pageEnd: 2,
      boundingBoxes: [],
      original: "12. Smith, J. (2024). Example.",
      translated: null,
      extractionConfidence: 1,
      translationStatus: "skipped",
      parentBlockId: null,
      metadata: { role: "reference" },
    },
  ];
  return { paper, sections, blocks };
}

describe("Paper Package", () => {
  it("creates, validates, atomically persists, and loads", async () => {
    const fs = createMemoryFileSystem();
    const { paper, sections, blocks } = sample();
    const pkg = projectionToPackage({ paper, sections, blocks });
    const validation = validatePaperPackage(pkg);
    expect(validation.ok, JSON.stringify(validation.diagnostics)).toBe(true);
    expect(pkg.assets[0]?.path).toMatch(/^assets\/figure-001\./);
    expect(decodeDataUrl(String(blocks[1].metadata.imageUrl))).not.toBeNull();

    const { revision } = await persistPaperPackage(fs, pkg);
    expect(revision).toBeGreaterThanOrEqual(1);
    expect(await fs.exists("papers/paper-1/original.md")).toBe(true);
    expect(await fs.exists("papers/paper-1/ja.md")).toBe(true);

    expect(pkg.translation?.blocks["b-002"]?.status).toBe("completed");
    expect(pkg.structure.blocks["b-002"].translationStatus).toBeUndefined();

    const loaded = await loadPaperPackage(fs, "paper-1");
    expect(loaded.translation?.blocks["b-002"]?.status).toBe("completed");
    const projected = packageToProjection(loaded, paper);
    expect(projected.blocks.find((b) => b.id === "b-002")?.original).toContain("Recent advances");
    expect(projected.blocks.find((b) => b.id === "b-002")?.translated).toContain("ウェアラブル");
    expect(projected.paper.titleTranslated).toBe("研究");
  });

  it("rejects duplicate block IDs", () => {
    const { paper, sections, blocks } = sample();
    const pkg = projectionToPackage({ paper, sections, blocks });
    pkg.originalMarkdown = pkg.originalMarkdown.replace("b-002", "b-fig");
    const validation = validatePaperPackage(pkg);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.some((item) => item.code === "duplicate-block-id")).toBe(true);
  });

  it("translation checkpoint does not rewrite source.pdf, assets, or layout", async () => {
    const { resetPersistMetrics, persistMetrics, persistMutablePaperFiles } = await import(
      "../../data/package/persist"
    );
    const fs = createMemoryFileSystem();
    const { paper, sections, blocks } = sample();
    const pkg = projectionToPackage({
      paper,
      sections,
      blocks,
      sourcePdf: new Uint8Array([1, 2, 3, 4]),
      layout: { schemaVersion: 1, pages: [{ page: 1, spans: [] }] },
    });
    resetPersistMetrics();
    await persistPaperPackage(fs, pkg);
    expect(persistMetrics.sourcePdfWrites).toBe(1);
    expect(persistMetrics.layoutWrites).toBe(1);
    expect(persistMetrics.assetWrites).toBeGreaterThan(0);
    const sourceWrites = persistMetrics.sourcePdfWrites;
    const layoutWrites = persistMetrics.layoutWrites;
    const assetWrites = persistMetrics.assetWrites;
    const fullWrites = persistMetrics.fullPackageWrites;

    resetPersistMetrics();
    await persistMutablePaperFiles(fs, paper.id, {
      jaMarkdown: pkg.translatedMarkdown.replace("ウェアラブル", "ウェアラブル更新"),
    });
    expect(persistMetrics.fullPackageWrites).toBe(0);
    expect(persistMetrics.sourcePdfWrites).toBe(0);
    expect(persistMetrics.layoutWrites).toBe(0);
    expect(persistMetrics.assetWrites).toBe(0);
    expect(persistMetrics.mutableFileWrites).toBe(1);
    expect(await fs.readText("papers/paper-1/ja.md")).toContain("ウェアラブル更新");
    expect(await fs.readBytes("papers/paper-1/source.pdf")).toEqual(new Uint8Array([1, 2, 3, 4]));

    expect(sourceWrites + persistMetrics.sourcePdfWrites).toBe(1);
    expect(layoutWrites + persistMetrics.layoutWrites).toBe(1);
    expect(fullWrites).toBe(1);
    expect(assetWrites).toBeGreaterThan(0);
  });
});
