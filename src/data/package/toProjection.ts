import type { Paper, PaperBlock, Section, TranslationStatus } from "../../types/paper";
import { parsePaperMarkdown } from "../markdown/parse";
import type { PaperPackage } from "../types/package";
import type { StructureBlock } from "../types/structure";

function translationStatus(value: string | undefined): TranslationStatus {
  if (
    value === "pending" ||
    value === "processing" ||
    value === "completed" ||
    value === "failed" ||
    value === "skipped"
  ) {
    return value;
  }
  return "pending";
}

function blockType(value: string): PaperBlock["type"] {
  if (
    value === "heading" ||
    value === "paragraph" ||
    value === "figure" ||
    value === "table" ||
    value === "equation" ||
    value === "footnote" ||
    value === "reference"
  ) {
    return value;
  }
  return "paragraph";
}

function textById(markdown: string, paperId: string): Map<string, string> {
  const parsed = parsePaperMarkdown(markdown, paperId);
  return new Map(parsed.nodes.filter((node) => node.id).map((node) => [node.id, node.text]));
}

function figureSrc(markdown: string, paperId: string): Map<string, string> {
  const parsed = parsePaperMarkdown(markdown, paperId);
  const map = new Map<string, string>();
  for (const node of parsed.nodes) {
    if (node.src && node.id) map.set(node.id, node.src);
  }
  return map;
}

function mimeFromAssetPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/png";
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function normalizeAssetPath(path: string): string {
  return path.replace(/^\.\//, "");
}

function assetDataUrls(pkg: PaperPackage): Map<string, string> {
  const map = new Map<string, string>();
  for (const asset of pkg.assets) {
    const path = normalizeAssetPath(asset.path);
    const dataUrl = bytesToDataUrl(asset.bytes, mimeFromAssetPath(path));
    map.set(path, dataUrl);
    if (!path.startsWith("assets/")) map.set(`assets/${path}`, dataUrl);
  }
  return map;
}

function metaString(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function resolveImageUrl(
  imageSrc: string | undefined,
  metadata: Record<string, unknown> | undefined,
  assets: Map<string, string>
): string | undefined {
  const candidates = [
    imageSrc,
    metaString(metadata, "imageUrl"),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const normalized = normalizeAssetPath(candidate);
    const fromAssets = assets.get(normalized);
    if (fromAssets) return fromAssets;
  }
  for (const candidate of candidates) {
    if (candidate.startsWith("data:")) return candidate;
  }
  return imageSrc || metaString(metadata, "imageUrl") || undefined;
}

export function packageToProjection(
  pkg: PaperPackage,
  index: Paper
): { paper: Paper; sections: Section[]; blocks: PaperBlock[] } {
  const original = textById(pkg.originalMarkdown, pkg.paper.paperId);
  const translated = textById(pkg.translatedMarkdown, pkg.paper.paperId);
  const srcs = figureSrc(pkg.originalMarkdown, pkg.paper.paperId);
  const assets = assetDataUrls(pkg);
  const structureBlocks = pkg.structure.blocks;
  const order = Object.keys(structureBlocks);

  const sections: Section[] = (pkg.structure.sections ?? []).map((section) => ({
    id: section.id,
    paperId: pkg.paper.paperId,
    parentSectionId: section.parentSectionId,
    order: section.order,
    level: section.level,
    originalTitle: section.originalTitle,
    translatedTitle: section.translatedTitle,
    normalizedKind: section.normalizedKind as Section["normalizedKind"],
  }));

  const blocks: PaperBlock[] = order.map((id, indexInPaper) => {
    const meta: StructureBlock = structureBlocks[id];
    const type = blockType(meta.type);
    const isFigureLike = type === "figure" || type === "table";
    const captionOriginal =
      metaString(meta.metadata, "captionOriginal") ?? original.get(`${id}-caption`) ?? null;
    const captionTranslated =
      metaString(meta.metadata, "captionTranslated") ?? translated.get(`${id}-caption`) ?? null;
    const imageUrl = resolveImageUrl(srcs.get(id), meta.metadata, assets);
    const metadata: Record<string, unknown> = {
      ...(meta.metadata ?? {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(captionOriginal ? { captionOriginal } : {}),
      ...(captionTranslated ? { captionTranslated } : {}),
    };
    // Figure/table Markdown stores the label in image alt; caption text lives on
    // the following caption node / metadata. Prefer those over the alt label.
    const originalText = isFigureLike
      ? captionOriginal
      : (original.get(id) ?? captionOriginal);
    const translatedText = isFigureLike
      ? captionTranslated
      : (translated.get(id) ?? captionTranslated);
    return {
      id,
      paperId: pkg.paper.paperId,
      sectionId: meta.sectionId ?? null,
      type,
      order: indexInPaper,
      pageStart: meta.pageStart,
      pageEnd: meta.pageEnd,
      boundingBoxes: meta.boundingBoxes,
      original: originalText,
      translated: translatedText,
      extractionConfidence: meta.extractionConfidence,
      translationStatus: translationStatus(
        pkg.translation?.blocks[id]?.status ?? meta.translationStatus
      ),
      parentBlockId: meta.parentBlockId ?? null,
      metadata,
    };
  });

  const paper: Paper = {
    ...index,
    id: pkg.paper.paperId,
    titleOriginal: pkg.paper.title.original,
    titleTranslated: pkg.paper.title.translated,
    authors: pkg.paper.authors.map((author) => author.name),
    authorsStructured: pkg.paper.authors,
    affiliations: pkg.paper.affiliations,
    doi: pkg.paper.doi,
    packageRevision: pkg.paper.revision,
    publication: pkg.paper.publication,
    year: pkg.paper.year,
    pageCount: pkg.paper.pageCount,
    sourceFileHash: pkg.paper.sourceFileHash,
    sourceFileName: pkg.paper.sourceFileName,
    createdAt: pkg.paper.createdAt,
    updatedAt: pkg.paper.updatedAt,
  };

  return { paper, sections, blocks };
}
