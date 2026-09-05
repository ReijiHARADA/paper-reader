import { afterEach, describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../../data/fs/memoryFs";
import { persistMetrics, resetPersistMetrics } from "../../data/package/persist";
import {
  persistAfterMutation,
  rememberDocument,
  rememberSourcePdf,
  resetDocumentCache,
} from "../../data/repositories/documentRepository";
import { openSqlite } from "../../data/sqlite/client";
import type { Paper, PaperBlock, Section } from "../../types/paper";

const now = "2026-09-05T00:00:00.000Z";

afterEach(() => {
  resetDocumentCache();
  resetPersistMetrics();
});

describe("source.pdf first persist", () => {
  it("writes source.pdf inside the first Paper Package commit", async () => {
    const fs = createMemoryFileSystem();
    const db = await openSqlite(fs);
    const paper: Paper = {
      id: "src-1",
      sourceFilePath: "a.pdf",
      sourceFileHash: "hash-src",
      sourceStoredPath: "papers/src-1/source.pdf",
      titleOriginal: "Source",
      titleTranslated: "原本",
      authors: [],
      publication: null,
      year: 2026,
      pageCount: 1,
      processingStatus: "glossary",
      lastReadBlockId: null,
      lastReadOffset: null,
      createdAt: now,
      updatedAt: now,
    };
    const sections: Section[] = [
      {
        id: "s-1",
        paperId: "src-1",
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
        paperId: "src-1",
        sectionId: "s-1",
        type: "paragraph",
        order: 0,
        pageStart: 1,
        pageEnd: 1,
        boundingBoxes: [],
        original: "Hello.",
        translated: null,
        extractionConfidence: 1,
        translationStatus: "pending",
        parentBlockId: null,
        metadata: {},
      },
    ];
    const pdf = new Uint8Array([37, 80, 68, 70]);
    rememberSourcePdf(paper.id, pdf);
    rememberDocument(paper, sections, blocks);
    resetPersistMetrics();
    await persistAfterMutation(fs, db, paper.id);

    expect(persistMetrics.fullPackageWrites).toBe(1);
    expect(persistMetrics.sourcePdfWrites).toBe(1);
    expect(await fs.readBytes("papers/src-1/source.pdf")).toEqual(pdf);
    await db.close();
  });
});
