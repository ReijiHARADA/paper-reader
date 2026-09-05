import { describe, expect, it, beforeEach } from "vitest";
import { resetStorageForTests } from "../data/runtime";
import { saveBlocks, saveGlossary, savePaper, saveSections } from "../services/database";
import { reapplyGlossary } from "../services/glossary/apply";
import type { Paper, PaperBlock, Section } from "../types/paper";

const now = "2026-09-05T00:00:00.000Z";

describe("reapplyGlossary", () => {
  beforeEach(async () => {
    await resetStorageForTests();
  });

  it("applies saved glossary through the document persist path", async () => {
    const paper: Paper = {
      id: "g1",
      sourceFilePath: "g.pdf",
      sourceFileHash: "gh",
      titleOriginal: "Affordance Study",
      titleTranslated: "Affordance の研究",
      authors: [],
      publication: null,
      year: null,
      pageCount: 1,
      processingStatus: "translating",
      lastReadBlockId: null,
      lastReadOffset: null,
      createdAt: now,
      updatedAt: now,
    };
    const sections: Section[] = [
      {
        id: "s1",
        paperId: "g1",
        parentSectionId: null,
        order: 0,
        level: 1,
        originalTitle: "Method",
        translatedTitle: "embodied Method",
        normalizedKind: "method",
      },
    ];
    const blocks: PaperBlock[] = [
      {
        id: "b1",
        paperId: "g1",
        sectionId: "s1",
        type: "paragraph",
        order: 0,
        pageStart: 1,
        pageEnd: 1,
        boundingBoxes: [],
        original: "The affordance is clear.",
        translated: "The affordance is clear.",
        extractionConfidence: 1,
        translationStatus: "completed",
        parentBlockId: null,
        metadata: {},
      },
    ];
    await savePaper(paper);
    await saveSections(sections);
    await saveBlocks(blocks);
    await saveGlossary("g1", [{ term: "affordance", translation: "アフォーダンス" }]);

    const updated = await reapplyGlossary("g1");
    expect(updated.paper?.titleTranslated).toContain("アフォーダンス");
    expect(updated.blocks[0]?.translated).toContain("アフォーダンス");
  });
});
