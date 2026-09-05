import type { Paper, Section, PaperBlock } from "../types/paper";
import type { WorkspacePaper } from "../types/project";
import type { Annotation } from "../types/annotation";
import type { GlossaryEntry } from "./llm/types";
import type { TranslationCacheEntry } from "./translation/types";
import type { BenchmarkEntry } from "../data/types/benchmark";
import { getStorage } from "../data/runtime";
import { migrateIndexedDbV4IfNeeded } from "../data/migration/migrate";
import {
  deletePaperIndex,
  getAllPaperIndexes,
  getPaperIndex,
  getPaperIndexByHash,
  indexPaperText,
  saveReadingPositionRow,
  upsertPaperIndex,
} from "../data/repositories/paperRepository";
import {
  flushDocumentPersist,
  forgetDocument,
  getDocumentBlocks,
  getDocumentSections,
  peekDocument,
  persistAfterMutation,
  rememberDocument,
  saveDocumentBlocks,
  saveDocumentSections,
  updateBlockTranslationText,
  updateDocumentBlock,
} from "../data/repositories/documentRepository";
import {
  deleteWorkspacePaper,
  getWorkspacePaper,
  listAllWorkspacePapers,
  listWorkspacePapersByNode,
  listWorkspacePapersByPaper,
  saveWorkspacePaper as saveWorkspacePaperRow,
} from "../data/repositories/workspaceRepository";
import {
  deleteAnnotationRow,
  getAnnotationRow,
  listAnnotationsByBlock,
  listAnnotationsByPaper,
  saveAnnotationRow,
} from "../data/repositories/annotationRepository";
import {
  clearTranslationCacheRows,
  getCachedTranslationRow,
  getGlossaryRow,
  getSettingRow,
  listAllBenchmarks,
  listBenchmarksByModel,
  listBenchmarksByPaper,
  saveBenchmarkRow,
  saveGlossaryRow,
  saveSettingRow,
  saveTranslationCacheRow,
} from "../data/repositories/settingsRepository";
import { paperDir } from "../data/package/persist";
import { syncPaperIndexesFromPackages } from "../data/package/syncIndex";

export type { BenchmarkEntry };

let migrated = false;

async function ready() {
  const storage = await getStorage();
  if (!migrated) {
    await migrateIndexedDbV4IfNeeded(storage.fs, storage.db);
    await syncPaperIndexesFromPackages(storage.fs, storage.db);
    migrated = true;
  }
  return storage;
}

export function resetDatabaseMigrationFlagForTests(): void {
  migrated = false;
}

export async function computeTextHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function savePaper(paper: Paper): Promise<void> {
  const { fs, db } = await ready();
  upsertPaperIndex(db, paper);
  const cached = peekDocument(paper.id);
  rememberDocument(paper, cached?.sections, cached?.blocks);
  if (cached?.blocks.length) {
    await persistAfterMutation(fs, db, paper.id);
  }
}

export async function markPaperOpened(paperId: string): Promise<void> {
  const { db } = await ready();
  const paper = getPaperIndex(db, paperId);
  if (!paper) return;
  const lastOpenedAt = new Date().toISOString();
  upsertPaperIndex(db, { ...paper, lastOpenedAt });
  const cached = peekDocument(paperId);
  rememberDocument({ ...paper, lastOpenedAt }, cached?.sections, cached?.blocks);
}

export async function setPaperFavorite(paperId: string, favorite: boolean): Promise<void> {
  const { db } = await ready();
  const paper = getPaperIndex(db, paperId);
  if (!paper) return;
  upsertPaperIndex(db, { ...paper, favorite });
  const cached = peekDocument(paperId);
  rememberDocument({ ...paper, favorite }, cached?.sections, cached?.blocks);
}

export async function flushPaperPersist(paperId?: string): Promise<void> {
  const { fs, db } = await ready();
  await flushDocumentPersist(fs, db, paperId);
}

export async function flushPersistence(): Promise<void> {
  const { fs, db } = await ready();
  await flushDocumentPersist(fs, db);
  await db.persist();
}

export async function getPaper(id: string): Promise<Paper | undefined> {
  const { db } = await ready();
  return getPaperIndex(db, id) ?? peekDocument(id)?.paper;
}

export async function getAllPapers(): Promise<Paper[]> {
  const { db } = await ready();
  return getAllPaperIndexes(db);
}

export async function getPaperByHash(hash: string): Promise<Paper | undefined> {
  const { db } = await ready();
  return getPaperIndexByHash(db, hash);
}

export async function deletePaper(id: string): Promise<void> {
  const { fs, db } = await ready();
  db.transaction(() => {
    deletePaperIndex(db, id);
  });
  forgetDocument(id);
  await fs.remove(paperDir(id));
}

export async function saveSections(sections: Section[]): Promise<void> {
  const { fs, db } = await ready();
  if (sections[0]) {
    const paper = getPaperIndex(db, sections[0].paperId) ?? peekDocument(sections[0].paperId)?.paper;
    if (paper) rememberDocument(paper, sections, peekDocument(paper.id)?.blocks);
  }
  await saveDocumentSections(fs, db, sections);
}

export async function getSectionsByPaper(paperId: string): Promise<Section[]> {
  const { fs, db } = await ready();
  const paper = getPaperIndex(db, paperId) ?? peekDocument(paperId)?.paper;
  if (!paper) return peekDocument(paperId)?.sections ?? [];
  return getDocumentSections(fs, paper);
}

export async function saveBlocks(blocks: PaperBlock[]): Promise<void> {
  const { fs, db } = await ready();
  if (blocks[0]) {
    const paper = getPaperIndex(db, blocks[0].paperId) ?? peekDocument(blocks[0].paperId)?.paper;
    if (paper) rememberDocument(paper, peekDocument(paper.id)?.sections, blocks);
  }
  await saveDocumentBlocks(fs, db, blocks);
}

export async function getBlocksByPaper(paperId: string): Promise<PaperBlock[]> {
  const { fs, db } = await ready();
  const paper = getPaperIndex(db, paperId) ?? peekDocument(paperId)?.paper;
  if (!paper) return peekDocument(paperId)?.blocks ?? [];
  return getDocumentBlocks(fs, paper);
}

export async function updateBlock(block: PaperBlock): Promise<void> {
  const { fs, db } = await ready();
  await updateDocumentBlock(fs, db, block);
}

export async function updateBlockTranslation(
  paperId: string,
  blockId: string,
  translated: string
): Promise<void> {
  const { fs, db } = await ready();
  await updateBlockTranslationText(fs, db, paperId, blockId, translated);
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  const { db } = await ready();
  saveSettingRow(db, key, value);
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const { db } = await ready();
  return getSettingRow<T>(db, key);
}

export async function saveReadingPosition(
  paperId: string,
  blockId: string,
  offset: number
): Promise<void> {
  const { db } = await ready();
  saveReadingPositionRow(db, paperId, blockId, offset);
  const paper = getPaperIndex(db, paperId);
  if (paper) {
    rememberDocument(
      { ...paper, lastReadBlockId: blockId, lastReadOffset: offset },
      peekDocument(paperId)?.sections,
      peekDocument(paperId)?.blocks
    );
  }
}

export async function getCachedTranslation(
  textHash: string,
  model: string,
  modelVersion: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<string | null> {
  const { db } = await ready();
  return getCachedTranslationRow(db, textHash, model, modelVersion, sourceLanguage, targetLanguage);
}

export async function saveTranslationCache(
  textHash: string,
  entry: Omit<TranslationCacheEntry, "textHash" | "cachedAt">
): Promise<void> {
  const { db } = await ready();
  saveTranslationCacheRow(db, textHash, entry);
}

export async function clearCacheByModel(model: string): Promise<number> {
  const { db } = await ready();
  return clearTranslationCacheRows(db, model);
}

export async function clearTranslationCache(): Promise<number> {
  const { db } = await ready();
  return clearTranslationCacheRows(db);
}

export async function saveGlossary(paperId: string, entries: GlossaryEntry[]): Promise<void> {
  const { db } = await ready();
  saveGlossaryRow(db, paperId, entries);
}

export async function getGlossary(paperId: string): Promise<GlossaryEntry[]> {
  const { db } = await ready();
  return getGlossaryRow(db, paperId);
}

export async function saveBenchmark(entry: BenchmarkEntry): Promise<void> {
  const { db } = await ready();
  saveBenchmarkRow(db, entry);
}

export async function getBenchmarksByPaper(paperId: string): Promise<BenchmarkEntry[]> {
  const { db } = await ready();
  return listBenchmarksByPaper(db, paperId);
}

export async function getBenchmarksByModel(model: string): Promise<BenchmarkEntry[]> {
  const { db } = await ready();
  return listBenchmarksByModel(db, model);
}

export async function getAllBenchmarks(): Promise<BenchmarkEntry[]> {
  const { db } = await ready();
  return listAllBenchmarks(db);
}

export async function saveWorkspacePaper(link: WorkspacePaper): Promise<void> {
  const { db } = await ready();
  saveWorkspacePaperRow(db, link);
}
export async function getWorkspacePaperLink(
  nodeId: string,
  paperId: string
): Promise<WorkspacePaper | undefined> {
  const { db } = await ready();
  return getWorkspacePaper(db, nodeId, paperId);
}
export async function getWorkspacePapersByNode(nodeId: string): Promise<WorkspacePaper[]> {
  const { db } = await ready();
  return listWorkspacePapersByNode(db, nodeId);
}
export async function getWorkspacePapersByPaper(paperId: string): Promise<WorkspacePaper[]> {
  const { db } = await ready();
  return listWorkspacePapersByPaper(db, paperId);
}
export async function getAllWorkspacePapers(): Promise<WorkspacePaper[]> {
  const { db } = await ready();
  return listAllWorkspacePapers(db);
}
export async function deleteWorkspacePaperLink(nodeId: string, paperId: string): Promise<void> {
  const { db } = await ready();
  deleteWorkspacePaper(db, nodeId, paperId);
}

export async function saveAnnotation(annotation: Annotation): Promise<void> {
  const { db } = await ready();
  saveAnnotationRow(db, annotation);
}

export async function getAnnotation(id: string): Promise<Annotation | undefined> {
  const { db } = await ready();
  return getAnnotationRow(db, id);
}

export async function getAnnotationsByPaper(paperId: string): Promise<Annotation[]> {
  const { db } = await ready();
  return listAnnotationsByPaper(db, paperId);
}

export async function getAnnotationsByBlock(
  paperId: string,
  blockId: string
): Promise<Annotation[]> {
  const { db } = await ready();
  return listAnnotationsByBlock(db, paperId, blockId);
}

export async function deleteAnnotation(id: string): Promise<void> {
  const { db } = await ready();
  deleteAnnotationRow(db, id);
}

export { indexPaperText };
