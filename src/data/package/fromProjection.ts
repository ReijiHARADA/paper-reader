import type { Paper, PaperBlock, Section } from "../../types/paper";
import { PACKAGE_SCHEMA_VERSION, STRUCTURE_SCHEMA_VERSION } from "../schemaVersion";
import { applyCitationLinks, blocksToDocument, documentToMarkdown } from "../markdown/documentAst";
import type { LayoutFile } from "../types/layout";
import type { PaperJson, PaperPackage } from "../types/package";
import type { StructureFile, StructureRelation } from "../types/structure";

export function paperToPaperJson(paper: Paper, revision = 1): PaperJson {
  return {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    paperId: paper.id,
    revision,
    title: {
      original: paper.titleOriginal,
      translated: paper.titleTranslated,
    },
    authors: paper.authors.map((name, index) => ({
      id: `author-${index + 1}`,
      name,
      affiliationIds: [],
    })),
    affiliations: [],
    publication: paper.publication,
    year: paper.year,
    doi: null,
    pageCount: paper.pageCount,
    sourceFileHash: paper.sourceFileHash,
    sourceFileName: paper.sourceFileName,
    createdAt: paper.createdAt,
    updatedAt: paper.updatedAt,
  };
}

export function projectionToStructure(
  sections: Section[],
  blocks: PaperBlock[],
  extraRelations: StructureRelation[] = []
): StructureFile {
  const structure: StructureFile = {
    schemaVersion: STRUCTURE_SCHEMA_VERSION,
    blocks: {},
    relations: [...extraRelations],
    sections: sections.map((section) => ({
      id: section.id,
      parentSectionId: section.parentSectionId,
      order: section.order,
      level: section.level,
      originalTitle: section.originalTitle,
      translatedTitle: section.translatedTitle,
      normalizedKind: section.normalizedKind,
    })),
  };

  const ordered = [...blocks].filter((block) => block.type !== "heading").sort((a, b) => a.order - b.order);
  for (let i = 0; i < ordered.length; i++) {
    const block = ordered[i];
    const lines = Array.isArray(block.metadata.lines)
      ? (block.metadata.lines as StructureFile["blocks"][string]["lines"])
      : undefined;
    structure.blocks[block.id] = {
      type: block.type,
      pageStart: block.pageStart,
      pageEnd: block.pageEnd,
      boundingBoxes: block.boundingBoxes,
      column: typeof block.metadata.column === "string" ? block.metadata.column : undefined,
      extractionConfidence: block.extractionConfidence,
      evidence: Array.isArray(block.metadata.evidence)
        ? (block.metadata.evidence as StructureFile["blocks"][string]["evidence"])
        : undefined,
      lines,
      sectionId: block.sectionId,
      parentBlockId: block.parentBlockId,
      translationStatus: block.translationStatus,
      metadata: block.metadata,
    };
    if (i > 0) {
      structure.relations.push({
        type: "READS_BEFORE",
        from: ordered[i - 1].id,
        to: block.id,
      });
    }
    if (block.sectionId) {
      structure.relations.push({
        type: "CHILD_OF",
        from: block.id,
        to: block.sectionId,
      });
    }
  }
  return structure;
}

export function projectionToPackage(input: {
  paper: Paper;
  sections: Section[];
  blocks: PaperBlock[];
  revision?: number;
  layout?: LayoutFile;
  sourcePdf?: Uint8Array;
}): PaperPackage {
  const originalDoc = blocksToDocument({
    paper: input.paper,
    sections: input.sections,
    blocks: input.blocks,
    language: "en",
  });
  const translatedDoc = blocksToDocument({
    paper: input.paper,
    sections: input.sections,
    blocks: input.blocks,
    language: "ja",
  });
  const structure = projectionToStructure(input.sections, input.blocks);
  structure.references = originalDoc.references;
  for (const ref of Object.values(originalDoc.references)) {
    const block = structure.blocks[ref.blockId];
    if (!block) continue;
    block.referenceId = ref.id;
    block.metadata = { ...block.metadata, referenceId: ref.id };
  }

  originalDoc.nodes = originalDoc.nodes.map((node) =>
    node.type === "paragraph" || node.type === "footnote"
      ? { ...node, text: applyCitationLinks(node.text, originalDoc.references) }
      : node
  );
  translatedDoc.nodes = translatedDoc.nodes.map((node) =>
    node.type === "paragraph" || node.type === "footnote"
      ? { ...node, text: applyCitationLinks(node.text, originalDoc.references) }
      : node
  );

  return {
    paper: paperToPaperJson(input.paper, input.revision ?? 1),
    originalMarkdown: documentToMarkdown(input.paper.id, "en", originalDoc.nodes),
    translatedMarkdown: documentToMarkdown(input.paper.id, "ja", translatedDoc.nodes),
    structure,
    layout: input.layout,
    assets: originalDoc.assets,
    sourcePdf: input.sourcePdf,
  };
}
