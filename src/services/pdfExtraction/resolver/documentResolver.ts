import type { LayoutBlock, PageColumnLayout } from "../../pdfLayout";
import { scoreLayoutBlock } from "../../extractionConfidence";
import type {
  CanonicalDiagnostics,
  CanonicalDocument,
  CanonicalNode,
} from "../canonical/types";
import type { FormatDetection, PageTextKind, ExtractionEvidence } from "../types";
import type { RoleCandidate } from "../generic/candidates";
import { formatTitleEvidence } from "../formats/applyHardRules";
import { normalizedTextHash } from "../sourceAnchor";
import { resolveTitle } from "./titleResolver";
import {
  affiliatedWithRelations,
  captionOfRelations,
  childOfRelations,
  figureNodesForCaptions,
  readsBeforeRelations,
} from "./relationResolver";

function nodeFromCandidate(candidate: RoleCandidate): CanonicalNode {
  const box = candidate.boundingBoxes[0] ?? candidate.layoutBlock.bbox;
  return {
    id: candidate.id,
    role: candidate.role,
    text: candidate.text,
    pageStart: candidate.pageStart,
    pageEnd: candidate.pageEnd,
    boundingBoxes: candidate.boundingBoxes,
    confidence: candidate.confidence,
    evidence: candidate.evidence,
    sourceAnchor: {
      page: candidate.pageStart,
      boundingBoxes: candidate.boundingBoxes,
      normalizedTextHash: normalizedTextHash(
        candidate.text,
        candidate.pageStart,
        box.x,
        box.y
      ),
    },
    column: candidate.column,
  };
}

function markAbstracts(nodes: CanonicalNode[]): CanonicalNode[] {
  let inAbstract = false;
  return nodes.map((node) => {
    if (node.role === "heading" && /^(?:abstract|要旨)$/i.test((node.text ?? "").trim())) {
      inAbstract = true;
      return node;
    }
    if (node.role === "heading") {
      inAbstract = false;
      return node;
    }
    if (inAbstract && node.role === "paragraph") {
      return { ...node, role: "abstract" };
    }
    return node;
  });
}

function average(values: number[], fallback = 0.8): number {
  if (values.length === 0) return fallback;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function resolveCanonicalDocument(input: {
  candidates: RoleCandidate[];
  layouts: PageColumnLayout[];
  blocks: LayoutBlock[];
  baseFontSize: number;
  detection: FormatDetection;
  pageKind: PageTextKind;
  pageCount: number;
  filePath?: string;
  fileHash?: string;
  metadataTitle?: string;
  extraEvidence?: ExtractionEvidence[];
  grobidTitle?: string | null;
}): CanonicalDocument {
  const { candidates, detection } = input;
  const titleResolved = resolveTitle({
    candidates,
    metadataTitle: input.metadataTitle,
    extra: [
      ...formatTitleEvidence(detection),
      ...(input.extraEvidence ?? []),
    ],
    grobidTitle: input.grobidTitle,
  });

  let nodes = candidates.map(nodeFromCandidate);
  nodes = markAbstracts(nodes);

  const titleNode = nodes.find((n) => n.role === "title");
  if (titleNode && titleResolved.text) {
    titleNode.text = titleResolved.text;
    titleNode.confidence = titleResolved.confidence;
    titleNode.evidence = [...titleNode.evidence, ...titleResolved.evidence];
  } else if (!titleNode && titleResolved.text) {
    nodes.unshift({
      id: "title-resolved",
      role: "title",
      text: titleResolved.text,
      pageStart: 1,
      pageEnd: 1,
      boundingBoxes: [],
      confidence: titleResolved.confidence,
      evidence: titleResolved.evidence,
      sourceAnchor: { page: 1, boundingBoxes: [] },
    });
  }

  const figureNodes = figureNodesForCaptions(candidates);
  nodes = [...nodes, ...figureNodes];

  const headingNodes = nodes.filter((n) => n.role === "heading");
  const readable = nodes.filter((n) =>
    ["heading", "paragraph", "abstract", "caption", "equation", "footnote", "reference", "other"].includes(
      n.role
    )
  );
  const fallbackOrder = readable.map((n) => n.id);

  const relations = [
    ...readsBeforeRelations(fallbackOrder),
    ...childOfRelations(headingNodes, input.baseFontSize),
    ...captionOfRelations(nodes),
    ...affiliatedWithRelations(nodes),
  ];

  const layoutScores = input.blocks.map((block) => {
    const layout = input.layouts.find((l) => l.page === block.pageStart);
    return scoreLayoutBlock(block, layout);
  });
  const layoutConfidence = average(layoutScores.map((s) => s.diagnostics.columnConfidence));
  const readingOrderConfidence = average(
    layoutScores.map((s) => s.diagnostics.readingOrderConfidence)
  );
  const unicodeConfidence = average(
    layoutScores.map((s) => s.diagnostics.unicodeConfidence)
  );
  const paragraphConfidence = average(
    layoutScores.map((s) => s.diagnostics.paragraphConfidence)
  );
  const formatConfidence =
    detection.applied === "generic"
      ? 0.55
      : detection.scores[detection.applied];
  const relationConfidence = relations.length === 0 ? 0.5 : average(relations.map((r) => r.score));
  const semanticConfidence = average(
    nodes.filter((n) => n.role === "title" || n.role === "heading" || n.role === "author").map((n) => n.confidence),
    titleResolved.confidence || 0.6
  );

  const diagnostics: CanonicalDiagnostics = {
    layoutConfidence: round2(layoutConfidence),
    readingOrderConfidence: round2(readingOrderConfidence),
    textIntegrityConfidence: round2(unicodeConfidence),
    semanticConfidence: round2(semanticConfidence),
    formatConfidence: round2(formatConfidence),
    relationConfidence: round2(relationConfidence),
    columnConfidence: round2(layoutConfidence),
    unicodeConfidence: round2(unicodeConfidence),
    paragraphConfidence: round2(paragraphConfidence),
  };

  return {
    source: {
      filePath: input.filePath,
      fileHash: input.fileHash,
      pageCount: input.pageCount,
    },
    pageCount: input.pageCount,
    format: detection,
    pageKind: input.pageKind,
    nodes,
    relations,
    diagnostics,
    formatId: detection.applied,
  };
}

function round2(n: number): number {
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

export { topologicalOrder } from "./relationResolver";
