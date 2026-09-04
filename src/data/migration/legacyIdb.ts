import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Annotation } from "../../types/annotation";
import type { Paper, PaperBlock, Section } from "../../types/paper";
import type { Project, ProjectPaper } from "../../types/project";
import type { GlossaryEntry } from "../../services/llm/types";
import type { TranslationCacheEntry } from "../../services/translation/types";
import type { BenchmarkEntry } from "../types/benchmark";

interface LegacyDB extends DBSchema {
  papers: { key: string; value: Paper; indexes: { "by-hash": string; "by-updated": string } };
  sections: { key: string; value: Section; indexes: { "by-paper": string } };
  blocks: { key: string; value: PaperBlock; indexes: { "by-paper": string; "by-section": string } };
  settings: { key: string; value: unknown };
  translationCache: {
    key: string;
    value: TranslationCacheEntry;
    indexes: { "by-hash": string; "by-model": string };
  };
  glossaries: {
    key: string;
    value: { paperId: string; entries: GlossaryEntry[]; createdAt: string; updatedAt: string };
    indexes: { "by-paper": string };
  };
  benchmarks: {
    key: string;
    value: BenchmarkEntry;
    indexes: { "by-paper": string; "by-model": string; "by-timestamp": string };
  };
  projects: { key: string; value: Project; indexes: { "by-updated": string } };
  projectPapers: {
    key: [string, string];
    value: ProjectPaper;
    indexes: { "by-project": string; "by-paper": string };
  };
  annotations: {
    key: string;
    value: Annotation;
    indexes: { "by-paper": string; "by-block": string; "by-project": string };
  };
}

const DB_NAME = "paper-reader";
const DB_VERSION = 4;

export async function openLegacyIdb(): Promise<IDBPDatabase<LegacyDB> | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    return await openDB<LegacyDB>(DB_NAME, DB_VERSION);
  } catch {
    return null;
  }
}

export async function readLegacyLibrary(db: IDBPDatabase<LegacyDB>): Promise<{
  papers: Paper[];
  sections: Section[];
  blocks: PaperBlock[];
  projects: Project[];
  projectPapers: ProjectPaper[];
  annotations: Annotation[];
  glossaries: Array<{ paperId: string; entries: GlossaryEntry[]; createdAt: string; updatedAt: string }>;
  translationCache: TranslationCacheEntry[];
  settings: unknown[];
  benchmarks: BenchmarkEntry[];
}> {
  const [
    papers,
    sections,
    blocks,
    projects,
    projectPapers,
    annotations,
    glossaries,
    translationCache,
    settings,
    benchmarks,
  ] = await Promise.all([
    db.objectStoreNames.contains("papers") ? db.getAll("papers") : [],
    db.objectStoreNames.contains("sections") ? db.getAll("sections") : [],
    db.objectStoreNames.contains("blocks") ? db.getAll("blocks") : [],
    db.objectStoreNames.contains("projects") ? db.getAll("projects") : [],
    db.objectStoreNames.contains("projectPapers") ? db.getAll("projectPapers") : [],
    db.objectStoreNames.contains("annotations") ? db.getAll("annotations") : [],
    db.objectStoreNames.contains("glossaries") ? db.getAll("glossaries") : [],
    db.objectStoreNames.contains("translationCache") ? db.getAll("translationCache") : [],
    db.objectStoreNames.contains("settings") ? db.getAll("settings") : [],
    db.objectStoreNames.contains("benchmarks") ? db.getAll("benchmarks") : [],
  ]);
  return {
    papers,
    sections,
    blocks,
    projects,
    projectPapers,
    annotations,
    glossaries,
    translationCache,
    settings,
    benchmarks,
  };
}
