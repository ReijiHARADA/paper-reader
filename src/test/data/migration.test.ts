import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";
import { openDB } from "idb";
import { resetStorageForTests, getStorage } from "../../data/runtime";
import { migrateIndexedDbV4IfNeeded } from "../../data/migration/migrate";
import { loadPaperPackage } from "../../data/package/persist";
import { upsertPaperIndex } from "../../data/repositories/paperRepository";
import { getAnnotation, getPaper, getProject, getProjectPaper, savePaper } from "../../services/database";
import type { Paper, PaperBlock, Section } from "../../types/paper";

const now = "2026-09-05T00:00:00.000Z";

async function seedLegacy() {
  const db = await openDB("paper-reader", 4, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("papers")) {
        const papers = database.createObjectStore("papers", { keyPath: "id" });
        papers.createIndex("by-hash", "sourceFileHash");
        papers.createIndex("by-updated", "updatedAt");
      }
      if (!database.objectStoreNames.contains("sections")) {
        const sections = database.createObjectStore("sections", { keyPath: "id" });
        sections.createIndex("by-paper", "paperId");
      }
      if (!database.objectStoreNames.contains("blocks")) {
        const blocks = database.createObjectStore("blocks", { keyPath: "id" });
        blocks.createIndex("by-paper", "paperId");
        blocks.createIndex("by-section", "sectionId");
      }
      if (!database.objectStoreNames.contains("projects")) {
        database.createObjectStore("projects", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("projectPapers")) {
        const links = database.createObjectStore("projectPapers", { keyPath: ["projectId", "paperId"] });
        links.createIndex("by-project", "projectId");
        links.createIndex("by-paper", "paperId");
      }
      if (!database.objectStoreNames.contains("annotations")) {
        const annotations = database.createObjectStore("annotations", { keyPath: "id" });
        annotations.createIndex("by-paper", "paperId");
        annotations.createIndex("by-block", "blockId");
        annotations.createIndex("by-project", "projectId");
      }
    },
  });
  const paper: Paper = {
    id: "legacy-paper",
    sourceFilePath: "old.pdf",
    sourceFileHash: "legacy-hash",
    titleOriginal: "Legacy Title",
    titleTranslated: "旧題",
    authors: ["Ada"],
    publication: null,
    year: 2024,
    pageCount: 1,
    processingStatus: "ready",
    lastReadBlockId: "legacy-b1",
    lastReadOffset: 12,
    createdAt: now,
    updatedAt: now,
  };
  const section: Section = {
    id: "legacy-s1",
    paperId: "legacy-paper",
    parentSectionId: null,
    order: 0,
    level: 1,
    originalTitle: "Abstract",
    translatedTitle: "概要",
    normalizedKind: "abstract",
  };
  const block: PaperBlock = {
    id: "legacy-b1",
    paperId: "legacy-paper",
    sectionId: "legacy-s1",
    type: "paragraph",
    order: 0,
    pageStart: 1,
    pageEnd: 1,
    boundingBoxes: [],
    original: "Hello legacy.",
    translated: "こんにちは。",
    extractionConfidence: 0.8,
    translationStatus: "completed",
    parentBlockId: null,
    metadata: {
      imageUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    },
  };
  await db.put("papers", paper);
  await db.put("sections", section);
  await db.put("blocks", block);
  await db.put("projects", {
    id: "legacy-proj",
    name: "Old Project",
    createdAt: now,
    updatedAt: now,
  });
  await db.put("projectPapers", {
    projectId: "legacy-proj",
    paperId: "legacy-paper",
    createdAt: now,
    updatedAt: now,
  });
  await db.put("annotations", {
    id: "legacy-a1",
    paperId: "legacy-paper",
    projectId: "legacy-proj",
    blockId: "legacy-b1",
    startOffset: 0,
    endOffset: 5,
    selectedText: "こんに",
    prefixContext: "",
    suffixContext: "ちは。",
    translationTextHash: "x",
    note: "memo",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  db.close();
}

describe("IndexedDB v4 migration", () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase("paper-reader");
    await resetStorageForTests();
  });

  it("copies papers, assets, projects, and annotations without deleting IDB", async () => {
    await seedLegacy();
    const { fs, db } = await getStorage();
    const first = await migrateIndexedDbV4IfNeeded(fs, db);
    expect(first.migrated).toBe(true);
    expect(first.paperCount).toBe(1);

    const paper = await getPaper("legacy-paper");
    expect(paper?.titleOriginal).toBe("Legacy Title");
    const pkg = await loadPaperPackage(fs, "legacy-paper");
    expect(pkg.originalMarkdown).toContain("Hello legacy.");
    expect(pkg.translatedMarkdown).toContain("こんにちは");
    expect(pkg.structure.blocks["legacy-b1"]).toBeTruthy();

    const project = await getProject("legacy-proj");
    expect(project?.name).toBe("Old Project");
    expect(await getProjectPaper("legacy-proj", "legacy-paper")).toBeTruthy();
    expect((await getAnnotation("legacy-a1"))?.note).toBe("memo");

    const second = await migrateIndexedDbV4IfNeeded(fs, db);
    expect(second.migrated).toBe(false);
    const rows = db.query("SELECT id FROM papers");
    expect(rows).toHaveLength(1);

    await savePaper({ ...paper!, titleTranslated: "更新" });
    expect((await getPaper("legacy-paper"))?.titleTranslated).toBe("更新");
  });

  it("migrates remaining IDB papers when SQLite already has a row", { timeout: 15000 }, async () => {
    await seedLegacy();
    const { fs, db } = await getStorage();
    upsertPaperIndex(db, {
      id: "already-there",
      sourceFilePath: "x.pdf",
      sourceFileHash: "already-hash",
      titleOriginal: "Existing",
      titleTranslated: null,
      authors: [],
      publication: null,
      year: null,
      pageCount: 1,
      processingStatus: "ready",
      lastReadBlockId: null,
      lastReadOffset: null,
      createdAt: now,
      updatedAt: now,
    });
    const result = await migrateIndexedDbV4IfNeeded(fs, db);
    expect(result.paperCount).toBe(1);
    expect(db.get("SELECT id FROM papers WHERE id = ?", ["already-there"])).toBeTruthy();
    expect(db.get("SELECT id FROM papers WHERE id = ?", ["legacy-paper"])).toBeTruthy();
    expect(await loadPaperPackage(fs, "legacy-paper")).toBeTruthy();
  });
});
