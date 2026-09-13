import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Paper, PaperBlock, Section } from "../types/paper";

const blocksByPaper = new Map<string, PaperBlock[]>();
const sectionsByPaper = new Map<string, Section[]>();

vi.mock("../services/database", () => ({
  getAllPapers: vi.fn(async () => []),
  getBlocksByPaper: vi.fn(async (paperId: string) => blocksByPaper.get(paperId) ?? []),
  getSectionsByPaper: vi.fn(async (paperId: string) => sectionsByPaper.get(paperId) ?? []),
  getSetting: vi.fn(async () => ({})),
}));

vi.mock("../stores/libraryCache", () => ({
  useLibraryCache: {
    getState: () => ({
      papers: [],
      addPaper: vi.fn(),
      updatePaper: vi.fn(),
      setBlocks: vi.fn(),
      setSections: vi.fn(),
    }),
  },
}));

vi.mock("../stores/importJobStore", () => ({
  useImportJobStore: {
    getState: () => ({ jobs: [], patchJob: vi.fn(), removeJob: vi.fn(), upsertJob: vi.fn() }),
  },
}));

vi.mock("../stores/projectStore", () => ({
  useProjectStore: { getState: () => ({ upsertMembership: vi.fn() }) },
}));

vi.mock("../stores/toastStore", () => ({
  showToast: vi.fn(),
}));

vi.mock("../utils/batchBlockUpdates", () => ({
  createBlockUpdateBatcher: () => ({ push: vi.fn(), flush: vi.fn() }),
}));

vi.mock("uuid", () => ({ v4: () => "test-id" }));

import { shouldResumePaperAfterServerReady } from "../services/import/startBackgroundImport";

function paper(id: string, processingStatus: Paper["processingStatus"]): Paper {
  return {
    id,
    sourceFilePath: `${id}.pdf`,
    sourceFileHash: id,
    titleOriginal: "A Complete Paper",
    titleTranslated: "完全な論文",
    processingStatus,
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-09-13T00:00:00.000Z",
  } as Paper;
}

function paragraph(partial: Partial<PaperBlock> & { id: string; paperId: string }): PaperBlock {
  return {
    id: partial.id,
    paperId: partial.paperId,
    sectionId: partial.sectionId ?? "s1",
    type: "paragraph",
    order: 0,
    pageStart: 1,
    pageEnd: 1,
    original: "This is a complete English paragraph that should be translated when the server becomes available.",
    translated: undefined,
    translationStatus: undefined,
    metadata: {},
    extractionConfidence: { score: 1, warnings: [] },
    ...partial,
  } as PaperBlock;
}

describe("server-ready translation resume selection", () => {
  beforeEach(() => {
    blocksByPaper.clear();
    sectionsByPaper.clear();
  });

  it.each(["translating", "queued", "glossary"] as const)(
    "resumes saved papers in active %s state",
    async (status) => {
      await expect(shouldResumePaperAfterServerReady(paper(`p-${status}`, status))).resolves.toBe(true);
    }
  );

  it.each(["partial", "failed"] as const)(
    "resumes saved papers in %s state only when translation work remains",
    async (status) => {
      const p = paper(`p-${status}`, status);
      blocksByPaper.set(p.id, [paragraph({ id: "b1", paperId: p.id, translationStatus: "failed" })]);
      await expect(shouldResumePaperAfterServerReady(p)).resolves.toBe(true);
    }
  );

  it("does not resume a failed paper that has no translation work saved", async () => {
    await expect(shouldResumePaperAfterServerReady(paper("p-failed-empty", "failed"))).resolves.toBe(false);
  });

  it("resumes a ready paper when it still has retryable failed paragraph blocks", async () => {
    const p = paper("p-ready", "ready");
    blocksByPaper.set(p.id, [paragraph({ id: "b1", paperId: p.id, translationStatus: "failed" })]);
    sectionsByPaper.set(p.id, [{ id: "s1", paperId: p.id, order: 0, originalTitle: "Introduction", normalizedKind: "introduction" } as Section]);

    await expect(shouldResumePaperAfterServerReady(p)).resolves.toBe(true);
  });

  it("does not resume a ready paper with no retryable failed blocks", async () => {
    const p = paper("p-ready-complete", "ready");
    blocksByPaper.set(p.id, [paragraph({ id: "b1", paperId: p.id, translated: "これは翻訳済みです。", translationStatus: "translated" })]);
    sectionsByPaper.set(p.id, [{ id: "s1", paperId: p.id, order: 0, originalTitle: "Introduction", translatedTitle: "はじめに", normalizedKind: "introduction" } as Section]);

    await expect(shouldResumePaperAfterServerReady(p)).resolves.toBe(false);
  });
});
