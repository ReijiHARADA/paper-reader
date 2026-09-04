import type { BoundingBox } from "../../../types/paper";
import type { LayoutBlock, LayoutRole, PageColumnLayout } from "../../pdfLayout";
import { reconstructDocument } from "../../pdfLayout";
import { scoreLayoutBlock } from "../../extractionConfidence";
import type { ExtractedPage } from "../../pdfService";
import type { CanonicalRole } from "../canonical/types";
import type { ExtractionEvidence, EvidenceSource } from "../types";

export type RoleCandidate = {
  id: string;
  role: CanonicalRole;
  text: string;
  confidence: number;
  source: EvidenceSource;
  reason: string;
  pageStart: number;
  pageEnd: number;
  boundingBoxes: BoundingBox[];
  column: string;
  layoutBlock: LayoutBlock;
  evidence: ExtractionEvidence[];
};

const ROLE_CONFIDENCE: Partial<Record<LayoutRole, number>> = {
  title: 0.82,
  author: 0.72,
  affiliation: 0.7,
  heading: 0.8,
  paragraph: 0.75,
  figure_caption: 0.85,
  table_caption: 0.85,
  equation: 0.7,
  footnote: 0.68,
  copyright: 0.9,
  header: 0.78,
  footer: 0.78,
};

function layoutRoleToCanonical(role: LayoutRole): CanonicalRole {
  if (role === "figure_caption" || role === "table_caption") return "caption";
  return role;
}

export type GenericExtraction = {
  layouts: PageColumnLayout[];
  blocks: LayoutBlock[];
  baseFontSize: number;
  candidates: RoleCandidate[];
};

/**
 * Generic heuristics as an evidence generator. Reconstructs lines/columns
 * via pdfLayout; does not finalize Canonical roles.
 */
export function generateGenericCandidates(pages: ExtractedPage[]): GenericExtraction {
  const { layouts, blocks, baseFontSize } = reconstructDocument(pages);
  const candidates: RoleCandidate[] = blocks.map((block, index) => {
    const layout = layouts.find((l) => l.page === block.pageStart);
    const scored = scoreLayoutBlock(block, layout);
    const base = ROLE_CONFIDENCE[block.role] ?? 0.65;
    const confidence = Math.min(0.95, (base + scored.score) / 2);
    const boxes = block.lines.map((line) => line.bbox);
    const role = layoutRoleToCanonical(block.role);
    const reason =
      block.role === "title"
        ? "largest font in first-page masthead"
        : `generic-heuristic role ${block.role}`;
    const evidence: ExtractionEvidence[] = [
      {
        source: "generic-heuristic",
        label: role,
        confidence,
        page: block.pageStart,
        bbox: block.bbox,
        reason,
      },
    ];
    return {
      id: `g-${index}`,
      role,
      text: block.text,
      confidence,
      source: "generic-heuristic",
      reason,
      pageStart: block.pageStart,
      pageEnd: block.pageEnd,
      boundingBoxes: boxes.length > 0 ? boxes : [block.bbox],
      column: block.column,
      layoutBlock: block,
      evidence,
    };
  });

  return { layouts, blocks, baseFontSize, candidates };
}
