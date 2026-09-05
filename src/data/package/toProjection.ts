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

export function packageToProjection(
  pkg: PaperPackage,
  index: Paper
): { paper: Paper; sections: Section[]; blocks: PaperBlock[] } {
  const original = textById(pkg.originalMarkdown, pkg.paper.paperId);
  const translated = textById(pkg.translatedMarkdown, pkg.paper.paperId);
  const srcs = figureSrc(pkg.originalMarkdown, pkg.paper.paperId);
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
    const imageSrc = srcs.get(id);
    const metadata: Record<string, unknown> = {
      ...(meta.metadata ?? {}),
      ...(imageSrc ? { imageUrl: imageSrc } : {}),
    };
    const originalText = original.get(id) ?? (typeof metadata.captionOriginal === "string" ? metadata.captionOriginal : null);
    const translatedText =
      translated.get(id) ?? (typeof metadata.captionTranslated === "string" ? metadata.captionTranslated : null);
    return {
      id,
      paperId: pkg.paper.paperId,
      sectionId: meta.sectionId ?? null,
      type: blockType(meta.type),
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
