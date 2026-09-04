import type { Paper, PaperBlock, Section } from "../../types/paper";
import type { FileSystem } from "../fs/types";
import { parsePaperMarkdown } from "../markdown/parse";
import { serializePaperMarkdown } from "../markdown/serialize";
import { projectionToPackage } from "../package/fromProjection";
import { loadPaperPackage, persistPaperPackage, paperPackageExists } from "../package/persist";
import { packageToProjection } from "../package/toProjection";
import { indexPaperText } from "./paperRepository";
import type { SqliteClient } from "../sqlite/client";

type CachedDocument = {
  paper: Paper;
  sections: Section[];
  blocks: PaperBlock[];
};

const cache = new Map<string, CachedDocument>();

export function rememberDocument(paper: Paper, sections?: Section[], blocks?: PaperBlock[]): void {
  const current = cache.get(paper.id);
  cache.set(paper.id, {
    paper,
    sections: sections ?? current?.sections ?? [],
    blocks: blocks ?? current?.blocks ?? [],
  });
}

export function forgetDocument(paperId: string): void {
  cache.delete(paperId);
}

export function peekDocument(paperId: string): CachedDocument | undefined {
  return cache.get(paperId);
}

export function resetDocumentCache(): void {
  cache.clear();
}

async function persistCached(
  fs: FileSystem,
  db: SqliteClient,
  paperId: string
): Promise<void> {
  const cached = cache.get(paperId);
  if (!cached || cached.blocks.length === 0) return;
  const existing = (await paperPackageExists(fs, paperId))
    ? await loadPaperPackage(fs, paperId).catch(() => null)
    : null;
  const pkg = projectionToPackage({
    paper: cached.paper,
    sections: cached.sections,
    blocks: cached.blocks,
    revision: existing?.paper.revision ?? 0,
    layout: existing?.layout,
    sourcePdf: existing?.sourcePdf,
  });
  if (existing?.assets.length && pkg.assets.length === 0) {
    pkg.assets = existing.assets;
  }
  try {
    await persistPaperPackage(fs, pkg);
    indexPaperText(db, cached.paper, pkg.originalMarkdown, pkg.translatedMarkdown);
  } catch (error) {
    console.warn("Paper Package persist failed:", error);
  }
}

export async function saveDocumentSections(
  fs: FileSystem,
  db: SqliteClient,
  sections: Section[]
): Promise<void> {
  if (sections.length === 0) return;
  const paperId = sections[0].paperId;
  const current = cache.get(paperId);
  if (current) current.sections = sections;
  else cache.set(paperId, { paper: placeholderPaper(paperId), sections, blocks: [] });
  await persistCached(fs, db, paperId);
}

export async function saveDocumentBlocks(
  fs: FileSystem,
  db: SqliteClient,
  blocks: PaperBlock[]
): Promise<void> {
  if (blocks.length === 0) return;
  const paperId = blocks[0].paperId;
  const current = cache.get(paperId);
  if (current) current.blocks = blocks;
  else cache.set(paperId, { paper: placeholderPaper(paperId), sections: [], blocks });
  await persistCached(fs, db, paperId);
}

export async function updateDocumentBlock(
  fs: FileSystem,
  db: SqliteClient,
  block: PaperBlock
): Promise<void> {
  const current = cache.get(block.paperId);
  const blocks = current?.blocks ?? [];
  const next = blocks.some((item) => item.id === block.id)
    ? blocks.map((item) => (item.id === block.id ? block : item))
    : [...blocks, block];
  if (current) current.blocks = next;
  else cache.set(block.paperId, { paper: placeholderPaper(block.paperId), sections: [], blocks: next });
  await persistCached(fs, db, block.paperId);
}

export async function updateBlockTranslationText(
  fs: FileSystem,
  db: SqliteClient,
  blockId: string,
  translated: string
): Promise<void> {
  for (const [paperId, doc] of cache) {
    const block = doc.blocks.find((item) => item.id === blockId);
    if (!block) continue;
    block.translated = translated;
    block.translationStatus = "completed";
    if (block.type === "figure" || block.type === "table") {
      block.metadata = { ...block.metadata, captionTranslated: translated };
    }
    if (doc.paper.titleOriginal === block.original) {
      doc.paper.titleTranslated = translated;
    }
    await persistJaUpdate(fs, db, paperId, blockId, translated);
    return;
  }
}

async function persistJaUpdate(
  fs: FileSystem,
  db: SqliteClient,
  paperId: string,
  blockId: string,
  translated: string
): Promise<void> {
  if (!(await paperPackageExists(fs, paperId))) {
    await persistCached(fs, db, paperId);
    return;
  }
  const pkg = await loadPaperPackage(fs, paperId);
  const parsed = parsePaperMarkdown(pkg.translatedMarkdown, paperId);
  const node = parsed.nodes.find((item) => item.id === blockId);
  if (node) node.text = translated;
  pkg.translatedMarkdown = serializePaperMarkdown(parsed.nodes, parsed.frontMatter);
  if (pkg.structure.blocks[blockId]) {
    pkg.structure.blocks[blockId] = {
      ...pkg.structure.blocks[blockId],
      translationStatus: "completed",
    };
  }
  pkg.paper.updatedAt = new Date().toISOString();
  await persistPaperPackage(fs, pkg);
  const cached = cache.get(paperId);
  if (cached) indexPaperText(db, cached.paper, pkg.originalMarkdown, pkg.translatedMarkdown);
}

export async function loadDocument(
  fs: FileSystem,
  paper: Paper
): Promise<CachedDocument> {
  const cached = cache.get(paper.id);
  if (cached && cached.blocks.length > 0) return cached;
  if (await paperPackageExists(fs, paper.id)) {
    const pkg = await loadPaperPackage(fs, paper.id);
    const projected = packageToProjection(pkg, paper);
    cache.set(paper.id, projected);
    return projected;
  }
  return cached ?? { paper, sections: [], blocks: [] };
}

export async function getDocumentSections(
  fs: FileSystem,
  paper: Paper
): Promise<Section[]> {
  return (await loadDocument(fs, paper)).sections;
}

export async function getDocumentBlocks(
  fs: FileSystem,
  paper: Paper
): Promise<PaperBlock[]> {
  return (await loadDocument(fs, paper)).blocks;
}

function placeholderPaper(id: string): Paper {
  const now = new Date().toISOString();
  return {
    id,
    sourceFilePath: "",
    sourceFileHash: "",
    titleOriginal: null,
    titleTranslated: null,
    authors: [],
    publication: null,
    year: null,
    pageCount: 0,
    processingStatus: "structuring",
    lastReadBlockId: null,
    lastReadOffset: null,
    createdAt: now,
    updatedAt: now,
  };
}

export { persistCached as persistDocumentPackage };
