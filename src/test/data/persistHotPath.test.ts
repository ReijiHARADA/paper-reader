import { afterEach, describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../../data/fs/memoryFs";
import { projectionToPackage } from "../../data/package/fromProjection";
import {
  persistMetrics,
  persistPaperPackage,
  resetPersistMetrics,
} from "../../data/package/persist";
import {
  flushDocumentPersist,
  rememberDocument,
  resetDocumentCache,
  updateDocumentBlock,
} from "../../data/repositories/documentRepository";
import { openSqlite } from "../../data/sqlite/client";
import type { Paper, PaperBlock, Section } from "../../types/paper";

const now = "2026-09-05T00:00:00.000Z";

function hotSample() {
  const paper: Paper = {
    id: "hot-1",
    sourceFilePath: "a.pdf",
    sourceFileHash: "hash-hot",
    titleOriginal: "Hot Path",
    titleTranslated: "ホットパス",
    authors: [],
    publication: null,
    year: 2026,
    pageCount: 1,
    processingStatus: "translating",
    lastReadBlockId: null,
    lastReadOffset: null,
    createdAt: now,
    updatedAt: now,
  };
  const sections: Section[] = [
    {
      id: "s-1",
      paperId: "hot-1",
      parentSectionId: null,
      order: 0,
      level: 1,
      originalTitle: "Abstract",
      translatedTitle: "概要",
      normalizedKind: "abstract",
    },
  ];
  const blocks: PaperBlock[] = [
    {
      id: "b-1",
      paperId: "hot-1",
      sectionId: "s-1",
      type: "paragraph",
      order: 0,
      pageStart: 1,
      pageEnd: 1,
      boundingBoxes: [],
      original: "First paragraph.",
      translated: null,
      extractionConfidence: 1,
      translationStatus: "pending",
      parentBlockId: null,
      metadata: {},
    },
    {
      id: "b-2",
      paperId: "hot-1",
      sectionId: "s-1",
      type: "paragraph",
      order: 1,
      pageStart: 1,
      pageEnd: 1,
      boundingBoxes: [],
      original: "Second paragraph.",
      translated: null,
      extractionConfidence: 1,
      translationStatus: "pending",
      parentBlockId: null,
      metadata: {},
    },
  ];
  return { paper, sections, blocks };
}

afterEach(() => {
  resetDocumentCache();
  resetPersistMetrics();
});

describe("translation persist hot path", () => {
  it("updates many blocks without rewriting the static package files", async () => {
    const fs = createMemoryFileSystem();
    const db = await openSqlite(fs);
    const { paper, sections, blocks } = hotSample();
    const pkg = projectionToPackage({
      paper: { ...paper, processingStatus: "glossary" },
      sections,
      blocks,
      sourcePdf: new Uint8Array([9, 8, 7]),
      layout: { schemaVersion: 1, pages: [{ page: 1, spans: [] }] },
    });
    resetPersistMetrics();
    await persistPaperPackage(fs, pkg);
    expect(persistMetrics.fullPackageWrites).toBe(1);
    expect(persistMetrics.sourcePdfWrites).toBe(1);
    expect(persistMetrics.layoutWrites).toBe(1);

    rememberDocument(paper, sections, blocks);
    resetPersistMetrics();
    for (const [index, block] of blocks.entries()) {
      await updateDocumentBlock(fs, db, {
        ...block,
        translated: `訳 ${index + 1}`,
        translationStatus: "completed",
      });
    }

    expect(persistMetrics.fullPackageWrites).toBe(0);
    expect(persistMetrics.sourcePdfWrites).toBe(0);
    expect(persistMetrics.layoutWrites).toBe(0);
    expect(persistMetrics.assetWrites).toBe(0);

    await flushDocumentPersist(fs, db, paper.id);
    expect(persistMetrics.fullPackageWrites).toBe(0);
    expect(persistMetrics.sourcePdfWrites).toBe(0);
    expect(persistMetrics.layoutWrites).toBe(0);
    expect(persistMetrics.mutableFileWrites).toBe(1);
    expect(await fs.readText("papers/hot-1/ja.md")).toContain("訳 1");
    expect(await fs.readText("papers/hot-1/ja.md")).toContain("訳 2");
    expect(await fs.readBytes("papers/hot-1/source.pdf")).toEqual(new Uint8Array([9, 8, 7]));
    await db.close();
  });
});
