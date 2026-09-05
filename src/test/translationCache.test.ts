import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { Paper, PaperBlock, Section } from "../types/paper";
import {
  clearTranslationCache,
  getBlocksByPaper,
  getCachedTranslation,
  getGlossary,
  getPaper,
  getSectionsByPaper,
  getSetting,
  saveBlocks,
  saveGlossary,
  savePaper,
  saveSections,
  saveSetting,
  saveTranslationCache,
  saveReadingPosition,
  getWorkspacePaperLink,
  saveAnnotation,
  getAnnotation,
} from "../services/database";
import { addPaperToWorkspace, createWorkspaceNode } from "../services/projectService";

const now = "2026-09-04T00:00:00.000Z";

function paper(): Paper {
  return {
    id: "cache-clear-paper",
    sourceFilePath: "/tmp/sample.pdf",
    sourceFileHash: "hash-cache-clear",
    titleOriginal: "Cached Title",
    titleTranslated: "キャッシュ済みタイトル",
    authors: ["Ada"],
    publication: null,
    year: 2026,
    pageCount: 1,
    processingStatus: "ready",
    lastReadBlockId: "cache-clear-block",
    lastReadOffset: 12,
    createdAt: now,
    updatedAt: now,
  };
}

function section(): Section {
  return {
    id: "cache-clear-section",
    paperId: "cache-clear-paper",
    parentSectionId: null,
    order: 0,
    level: 1,
    originalTitle: "Introduction",
    translatedTitle: "はじめに",
    normalizedKind: "introduction",
  };
}

function block(): PaperBlock {
  return {
    id: "cache-clear-block",
    paperId: "cache-clear-paper",
    sectionId: "cache-clear-section",
    type: "paragraph",
    order: 0,
    pageStart: 1,
    pageEnd: 1,
    boundingBoxes: [],
    original: "Hello cache.",
    translated: "こんにちはキャッシュ。",
    extractionConfidence: 1,
    translationStatus: "completed",
    parentBlockId: null,
    metadata: {},
  };
}

describe("clearTranslationCache", () => {
  it("deletes only the translationCache store", async () => {
    await savePaper(paper());
    await saveSections([section()]);
    await saveBlocks([block()]);
    await saveSetting("translationSettingsV2", {
      madladServerUrl: "http://127.0.0.1:8765",
      useCache: true,
    });
    await saveGlossary("cache-clear-paper", [
      { term: "cache", translation: "キャッシュ", definition: "" },
    ]);
    const node = await createWorkspaceNode({
      name: "Cache Project",
      parentId: null,
    });
    await addPaperToWorkspace(node.id, "cache-clear-paper");
    await saveAnnotation({
      id: "cache-clear-note",
      paperId: "cache-clear-paper",
      workspaceNodeId: "cache-clear-workspace",
      blockId: "cache-clear-block",
      startOffset: 0,
      endOffset: 5,
      selectedText: "こんにちは",
      prefixContext: "",
      suffixContext: "",
      translationTextHash: "note-hash",
      note: "keep me",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await saveTranslationCache("cache-clear-hash", {
      translatedText: "こんにちはキャッシュ。",
      model: "madlad",
      modelVersion: "3b",
      sourceLanguage: "en",
      targetLanguage: "ja",
    });
    await saveReadingPosition("cache-clear-paper", "cache-clear-block", 24);

    const removed = await clearTranslationCache();
    expect(removed).toBe(1);
    expect(
      await getCachedTranslation("cache-clear-hash", "madlad", "3b", "en", "ja")
    ).toBeNull();

    expect((await getPaper("cache-clear-paper"))?.titleTranslated).toBe(
      "キャッシュ済みタイトル"
    );
    expect((await getPaper("cache-clear-paper"))?.lastReadBlockId).toBe(
      "cache-clear-block"
    );
    expect((await getPaper("cache-clear-paper"))?.lastReadOffset).toBe(24);
    expect(await getSectionsByPaper("cache-clear-paper")).toHaveLength(1);
    expect((await getBlocksByPaper("cache-clear-paper"))[0]?.translated).toBe(
      "こんにちはキャッシュ。"
    );
    expect(await getGlossary("cache-clear-paper")).toEqual([
      { term: "cache", translation: "キャッシュ", definition: "" },
    ]);
    expect(await getWorkspacePaperLink(node.id, "cache-clear-paper")).toBeTruthy();
    expect((await getAnnotation("cache-clear-note"))?.note).toBe("keep me");
    expect(await getSetting("translationSettingsV2")).toMatchObject({
      useCache: true,
    });
  });
});
