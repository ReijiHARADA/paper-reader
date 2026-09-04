import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Paper, Section, PaperBlock } from "../types/paper";
import type { Project, ProjectPaper } from "../types/project";
import type { GlossaryEntry } from "./llm/types";
import type { TranslationCacheEntry } from "./translation/types";

interface PaperReaderDB extends DBSchema {
  papers: {
    key: string;
    value: Paper;
    indexes: {
      "by-hash": string;
      "by-updated": string;
    };
  };
  sections: {
    key: string;
    value: Section;
    indexes: {
      "by-paper": string;
    };
  };
  blocks: {
    key: string;
    value: PaperBlock;
    indexes: {
      "by-paper": string;
      "by-section": string;
    };
  };
  settings: {
    key: string;
    value: unknown;
  };
  translationCache: {
    key: string;
    value: TranslationCacheEntry;
    indexes: {
      "by-hash": string;
      "by-model": string;
    };
  };
  glossaries: {
    key: string;
    value: {
      paperId: string;
      entries: GlossaryEntry[];
      createdAt: string;
      updatedAt: string;
    };
    indexes: {
      "by-paper": string;
    };
  };
  benchmarks: {
    key: string;
    value: {
      id: string;
      paperId: string;
      model: string;
      modelVersion: string;
      inputChars: number;
      inputTokens: number | null;
      outputChars: number;
      translationTimeMs: number;
      charsPerSec: number;
      tokensPerSec: number | null;
      timestamp: string;
    };
    indexes: {
      "by-paper": string;
      "by-model": string;
      "by-timestamp": string;
    };
  };
  projects: {
    key: string;
    value: Project;
    indexes: {
      "by-updated": string;
    };
  };
  projectPapers: {
    key: [string, string];
    value: ProjectPaper;
    indexes: {
      "by-project": string;
      "by-paper": string;
    };
  };
}

const DB_NAME = "paper-reader";
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<PaperReaderDB>> | null = null;

function getDB(): Promise<IDBPDatabase<PaperReaderDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PaperReaderDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Version 1: Original stores
        if (oldVersion < 1) {
          // Papers store
          const paperStore = db.createObjectStore("papers", { keyPath: "id" });
          paperStore.createIndex("by-hash", "sourceFileHash");
          paperStore.createIndex("by-updated", "updatedAt");

          // Sections store
          const sectionStore = db.createObjectStore("sections", { keyPath: "id" });
          sectionStore.createIndex("by-paper", "paperId");

          // Blocks store
          const blockStore = db.createObjectStore("blocks", { keyPath: "id" });
          blockStore.createIndex("by-paper", "paperId");
          blockStore.createIndex("by-section", "sectionId");

          // Settings store
          db.createObjectStore("settings", { keyPath: "key" });
        }

        // Version 2: Add cache, glossary, and benchmark stores
        if (oldVersion < 2) {
          // Translation cache store
          if (!db.objectStoreNames.contains("translationCache")) {
            const cacheStore = db.createObjectStore("translationCache", { keyPath: "textHash" });
            cacheStore.createIndex("by-hash", "textHash");
            cacheStore.createIndex("by-model", "model");
          }

          // Glossaries store
          if (!db.objectStoreNames.contains("glossaries")) {
            const glossaryStore = db.createObjectStore("glossaries", { keyPath: "paperId" });
            glossaryStore.createIndex("by-paper", "paperId");
          }

          // Benchmarks store
          if (!db.objectStoreNames.contains("benchmarks")) {
            const benchmarkStore = db.createObjectStore("benchmarks", { keyPath: "id" });
            benchmarkStore.createIndex("by-paper", "paperId");
            benchmarkStore.createIndex("by-model", "model");
            benchmarkStore.createIndex("by-timestamp", "timestamp");
          }
        }

        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains("projects")) {
            const projectStore = db.createObjectStore("projects", { keyPath: "id" });
            projectStore.createIndex("by-updated", "updatedAt");
          }
          if (!db.objectStoreNames.contains("projectPapers")) {
            const linkStore = db.createObjectStore("projectPapers", {
              keyPath: ["projectId", "paperId"],
            });
            linkStore.createIndex("by-project", "projectId");
            linkStore.createIndex("by-paper", "paperId");
          }
        }
      },
    });
  }
  return dbPromise;
}

// ============================================================
// Paper operations
// ============================================================

export async function savePaper(paper: Paper): Promise<void> {
  const db = await getDB();
  await db.put("papers", paper);
}

export async function getPaper(id: string): Promise<Paper | undefined> {
  const db = await getDB();
  return db.get("papers", id);
}

export async function getAllPapers(): Promise<Paper[]> {
  const db = await getDB();
  return db.getAllFromIndex("papers", "by-updated");
}

export async function getPaperByHash(hash: string): Promise<Paper | undefined> {
  const db = await getDB();
  return db.getFromIndex("papers", "by-hash", hash);
}

export async function deletePaper(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ["papers", "sections", "blocks", "glossaries", "projectPapers"],
    "readwrite"
  );

  // Delete all related sections and blocks
  const sections = await tx.objectStore("sections").index("by-paper").getAllKeys(id);
  for (const sectionId of sections) {
    await tx.objectStore("sections").delete(sectionId);
  }

  const blocks = await tx.objectStore("blocks").index("by-paper").getAllKeys(id);
  for (const blockId of blocks) {
    await tx.objectStore("blocks").delete(blockId);
  }

  // Delete glossary
  await tx.objectStore("glossaries").delete(id);

  const links = await tx.objectStore("projectPapers").index("by-paper").getAllKeys(id);
  for (const key of links) {
    await tx.objectStore("projectPapers").delete(key);
  }

  await tx.objectStore("papers").delete(id);
  await tx.done;
}

// ============================================================
// Section operations
// ============================================================

export async function saveSections(sections: Section[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("sections", "readwrite");
  for (const section of sections) {
    await tx.store.put(section);
  }
  await tx.done;
}

export async function getSectionsByPaper(paperId: string): Promise<Section[]> {
  const db = await getDB();
  return db.getAllFromIndex("sections", "by-paper", paperId);
}

// ============================================================
// Block operations
// ============================================================

export async function saveBlocks(blocks: PaperBlock[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("blocks", "readwrite");
  for (const block of blocks) {
    await tx.store.put(block);
  }
  await tx.done;
}

export async function getBlocksByPaper(paperId: string): Promise<PaperBlock[]> {
  const db = await getDB();
  return db.getAllFromIndex("blocks", "by-paper", paperId);
}

export async function updateBlock(block: PaperBlock): Promise<void> {
  const db = await getDB();
  await db.put("blocks", block);
}

export async function updateBlockTranslation(
  blockId: string,
  translated: string
): Promise<void> {
  const db = await getDB();
  const block = await db.get("blocks", blockId);
  if (block) {
    block.translated = translated;
    block.translationStatus = "completed";
    await db.put("blocks", block);
  }
}

// ============================================================
// Settings operations
// ============================================================

export async function saveSetting(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put("settings", { key, value });
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  const result = await db.get("settings", key);
  if (result !== undefined && typeof result === "object" && result !== null && "value" in result) {
    return (result as { key: string; value: unknown }).value as T;
  }
  return undefined;
}

// ============================================================
// Reading position
// ============================================================

export async function saveReadingPosition(
  paperId: string,
  blockId: string,
  offset: number
): Promise<void> {
  const db = await getDB();
  const paper = await db.get("papers", paperId);
  if (paper) {
    paper.lastReadBlockId = blockId;
    paper.lastReadOffset = offset;
    paper.updatedAt = new Date().toISOString();
    await db.put("papers", paper);
  }
}

// ============================================================
// Translation Cache operations
// ============================================================

/**
 * Compute a hash for text to use as cache key.
 */
export async function computeTextHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Get cached translation if available.
 */
export async function getCachedTranslation(
  textHash: string,
  model: string,
  modelVersion: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<string | null> {
  const db = await getDB();
  const entry = await db.get("translationCache", textHash);
  
  if (
    entry &&
    entry.model === model &&
    entry.modelVersion === modelVersion &&
    entry.sourceLanguage === sourceLanguage &&
    entry.targetLanguage === targetLanguage
  ) {
    return entry.translatedText;
  }
  
  return null;
}

/**
 * Save translation to cache.
 */
export async function saveTranslationCache(
  textHash: string,
  entry: Omit<TranslationCacheEntry, "textHash" | "cachedAt">
): Promise<void> {
  const db = await getDB();
  await db.put("translationCache", {
    textHash,
    ...entry,
    cachedAt: Date.now(),
  });
}

/**
 * Clear translations for a specific model (for re-translation).
 */
export async function clearCacheByModel(model: string): Promise<number> {
  const db = await getDB();
  const entries = await db.getAllFromIndex("translationCache", "by-model", model);
  const tx = db.transaction("translationCache", "readwrite");
  
  for (const entry of entries) {
    await tx.store.delete(entry.textHash);
  }
  
  await tx.done;
  return entries.length;
}

// ============================================================
// Glossary operations
// ============================================================

/**
 * Save glossary for a paper.
 */
export async function saveGlossary(
  paperId: string,
  entries: GlossaryEntry[]
): Promise<void> {
  const db = await getDB();
  const existing = await db.get("glossaries", paperId);
  
  await db.put("glossaries", {
    paperId,
    entries,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Get glossary for a paper.
 */
export async function getGlossary(paperId: string): Promise<GlossaryEntry[]> {
  const db = await getDB();
  const entry = await db.get("glossaries", paperId);
  return entry?.entries || [];
}

// ============================================================
// Benchmark operations
// ============================================================

export interface BenchmarkEntry {
  id: string;
  paperId: string;
  model: string;
  modelVersion: string;
  inputChars: number;
  inputTokens: number | null;
  outputChars: number;
  translationTimeMs: number;
  charsPerSec: number;
  tokensPerSec: number | null;
  timestamp: string;
}

/**
 * Save benchmark entry.
 */
export async function saveBenchmark(entry: BenchmarkEntry): Promise<void> {
  const db = await getDB();
  await db.put("benchmarks", entry);
}

/**
 * Get benchmarks for a paper.
 */
export async function getBenchmarksByPaper(paperId: string): Promise<BenchmarkEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex("benchmarks", "by-paper", paperId);
}

/**
 * Get benchmarks for a model.
 */
export async function getBenchmarksByModel(model: string): Promise<BenchmarkEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex("benchmarks", "by-model", model);
}

/**
 * Get all benchmarks ordered by timestamp.
 */
export async function getAllBenchmarks(): Promise<BenchmarkEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex("benchmarks", "by-timestamp");
}

// ============================================================
// Project operations
// ============================================================

export async function saveProject(project: Project): Promise<void> {
  const db = await getDB();
  await db.put("projects", project);
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await getDB();
  return db.get("projects", id);
}

export async function getAllProjects(): Promise<Project[]> {
  const db = await getDB();
  const projects = await db.getAll("projects");
  return projects.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) * -1);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["projects", "projectPapers"], "readwrite");
  const links = await tx.objectStore("projectPapers").index("by-project").getAllKeys(id);
  for (const key of links) {
    await tx.objectStore("projectPapers").delete(key);
  }
  await tx.objectStore("projects").delete(id);
  await tx.done;
}

export async function saveProjectPaper(link: ProjectPaper): Promise<void> {
  const db = await getDB();
  await db.put("projectPapers", link);
}

export async function getProjectPaper(
  projectId: string,
  paperId: string
): Promise<ProjectPaper | undefined> {
  const db = await getDB();
  return db.get("projectPapers", [projectId, paperId]);
}

export async function getProjectPapersByProject(projectId: string): Promise<ProjectPaper[]> {
  const db = await getDB();
  return db.getAllFromIndex("projectPapers", "by-project", projectId);
}

export async function getProjectPapersByPaper(paperId: string): Promise<ProjectPaper[]> {
  const db = await getDB();
  return db.getAllFromIndex("projectPapers", "by-paper", paperId);
}

export async function getAllProjectPapers(): Promise<ProjectPaper[]> {
  const db = await getDB();
  return db.getAll("projectPapers");
}

export async function deleteProjectPaper(projectId: string, paperId: string): Promise<void> {
  const db = await getDB();
  await db.delete("projectPapers", [projectId, paperId]);
}
