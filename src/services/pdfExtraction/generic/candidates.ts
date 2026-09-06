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
  /** Competing generic evidence. The resolver, not this layer, chooses role. */
  roleScores: Partial<Record<CanonicalRole, number>>;
  style: StyleSignature;
};

export type StyleSignature = {
  fontSizeRatio: number;
  fontNames: string[];
  boldScore: number;
  italicScore: number;
  indent: number;
  spacingBefore: number;
  spacingAfter: number;
  uppercaseRatio: number;
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

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function styleSignature(
  block: LayoutBlock,
  layouts: PageColumnLayout[],
  baseFontSize: number,
  before?: LayoutBlock,
  after?: LayoutBlock
): StyleSignature {
  const lines = block.lines;
  const items = lines.flatMap((line) => line.items);
  const names = [...new Set(items.map((item) => item.fontName).filter(Boolean))];
  const bold = items.filter((item) => /(?:bold|black|heavy|semi[- ]?bold|demi)/i.test(item.fontName));
  const italic = items.filter((item) => /(?:italic|oblique)/i.test(item.fontName));
  const letters = (block.text.match(/[A-Za-z]/g) ?? []).length;
  const upper = (block.text.match(/[A-Z]/g) ?? []).length;
  const layout = layouts.find((candidate) => candidate.page === block.pageStart);
  const columnLeft = block.column === "right" ? layout?.rightX ?? 0 : layout?.leftX ?? 0;
  const previousBottom = before?.pageEnd === block.pageStart
    ? before.bbox.y + before.bbox.height
    : block.bbox.y;
  const nextTop = after?.pageStart === block.pageEnd ? after.bbox.y : block.bbox.y + block.bbox.height;
  return {
    fontSizeRatio: median(lines.map((line) => line.fontSize)) / Math.max(baseFontSize, 1),
    fontNames: names,
    boldScore: bold.length / Math.max(items.length, 1),
    italicScore: italic.length / Math.max(items.length, 1),
    indent: Math.max(0, block.bbox.x - columnLeft),
    spacingBefore: Math.max(0, block.bbox.y - previousBottom),
    spacingAfter: Math.max(0, nextTop - (block.bbox.y + block.bbox.height)),
    uppercaseRatio: upper / Math.max(letters, 1),
  };
}

function headingTextShape(text: string): boolean {
  const compact = text.trim();
  if (!compact || compact.length > 110 || compact.split(/\s+/).length > 16) return false;
  if (/[.!?。．]$/.test(compact) || /^\d+[.)]\s+[A-Z][a-z]+,?\s+[A-Z]/.test(compact)) return false;
  const letters = (compact.match(/[A-Za-z]/g) ?? []).length;
  const upper = (compact.match(/[A-Z]/g) ?? []).length;
  const uppercase = letters >= 4 && upper / Math.max(letters, 1) > 0.72;
  const titleCase = /^[A-Z][A-Za-z]*(?:[\s:–—-]+[A-Za-z]+)*$/.test(compact);
  return uppercase || titleCase || /^\d+(?:\.\d+)*\s+/.test(compact);
}

function paragraphLike(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lower = words.filter((word) => /^[a-z]/.test(word)).length;
  return words.length > 16 || lower >= 5 || /[.!?]\s*$/.test(text.trim());
}

function tableLike(block: LayoutBlock): boolean {
  const lines = block.lines;
  if (lines.length === 0) return false;
  const cellLines = lines.filter((line) => line.items.length >= 2);
  if (cellLines.length === 0) return false;
  const shortItems = cellLines.flatMap((line) => line.items).filter((item) => item.text.trim().length <= 24).length;
  const itemCount = cellLines.flatMap((line) => line.items).length;
  const numeric = cellLines.flatMap((line) => line.items).filter((item) => /\d/.test(item.text)).length;
  return itemCount >= 4 && shortItems / itemCount >= 0.7 && (numeric >= 2 || cellLines.length >= 2);
}

function equationScore(block: LayoutBlock, layout: PageColumnLayout | undefined): number {
  const text = block.text.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const math = (text.match(/[=+×÷∑∫√∞≈≠≤≥±∂∇α-ωΑ-Ω]/g) ?? []).length;
  const prose = words.filter((word) => /[A-Za-z]{3,}/.test(word)).length;
  const statistics = /(?:\b[ntz]\s*=|[χΧxX²]\s*\(|\b[FPt]\s*\(|\bp\s*[<=>])/.test(text);
  const sentence = /[,.;:]/.test(text) || /[.!?]$/.test(text);
  const columnWidth = layout ? (block.column === "right" ? layout.pageWidth - layout.rightX : layout.pageWidth / (layout.isMultiColumn ? 2 : 1)) : 0;
  const compact = columnWidth > 0 && block.bbox.width < columnWidth * 0.72;
  const centered = layout && Math.abs((block.bbox.x + block.bbox.width / 2) - layout.pageWidth / 2) < layout.pageWidth * 0.12;
  let score = block.role === "equation" ? 0.58 : 0.08;
  score += Math.min(0.26, math * 0.06);
  if (compact) score += 0.12;
  if (centered) score += 0.08;
  if (/\(\s*\d{1,2}[a-z]?\s*\)\s*$/.test(text)) score += 0.14;
  if (prose >= 4) score -= 0.36;
  if (sentence) score -= 0.2;
  if (statistics && (prose >= 2 || sentence)) score -= 0.42;
  return clamp(score);
}

/**
 * Generic heuristics as an evidence generator. Reconstructs lines/columns
 * via pdfLayout; does not finalize Canonical roles.
 */
export function generateGenericCandidates(pages: ExtractedPage[]): GenericExtraction {
  const { layouts, blocks, baseFontSize } = reconstructDocument(pages);
  const fontUse = new Map<string, number>();
  let itemCount = 0;
  for (const block of blocks) {
    for (const line of block.lines) {
      for (const item of line.items) {
        itemCount++;
        fontUse.set(item.fontName, (fontUse.get(item.fontName) ?? 0) + 1);
      }
    }
  }
  const candidates: RoleCandidate[] = blocks.map((block, index) => {
    const layout = layouts.find((l) => l.page === block.pageStart);
    const scored = scoreLayoutBlock(block, layout);
    const base = ROLE_CONFIDENCE[block.role] ?? 0.65;
    const confidence = Math.min(0.95, (base + scored.score) / 2);
    const boxes = block.lines.map((line) => line.bbox);
    const role = layoutRoleToCanonical(block.role);
    const style = styleSignature(block, layouts, baseFontSize, blocks[index - 1], blocks[index + 1]);
    const scoreByRole: Partial<Record<CanonicalRole, number>> = {
      paragraph: role === "paragraph" ? confidence : 0.22,
      [role]: confidence,
    };
    const anchoredHeading = blocks.some((other, otherIndex) =>
      otherIndex !== index && other.role === "heading" &&
      Math.abs(styleSignature(other, layouts, baseFontSize, blocks[otherIndex - 1], blocks[otherIndex + 1]).boldScore - style.boldScore) < 0.25 &&
      Math.abs(styleSignature(other, layouts, baseFontSize, blocks[otherIndex - 1], blocks[otherIndex + 1]).fontSizeRatio - style.fontSizeRatio) < 0.18
    );
    const nonBodyFont = style.fontNames.length > 0 && style.fontNames.every(
      (fontName) => (fontUse.get(fontName) ?? itemCount) / Math.max(itemCount, 1) < 0.18
    );
    if (headingTextShape(block.text) && (!paragraphLike(block.text) || nonBodyFont)) {
      const styleEvidence = (style.boldScore >= 0.35 ? 0.32 : 0) +
        (style.fontSizeRatio >= 1.04 ? 0.14 : 0) +
        (style.spacingBefore >= baseFontSize * 0.55 ? 0.1 : 0) +
        (anchoredHeading ? 0.16 : 0) +
        (nonBodyFont ? 0.32 : 0);
      scoreByRole.heading = Math.max(
        role === "heading" ? confidence : 0,
        clamp((nonBodyFont ? 0.54 : 0.38) + styleEvidence)
      );
    }
    const equation = equationScore(block, layout);
    if (equation > 0.12) scoreByRole.equation = equation;
    if (tableLike(block)) scoreByRole.table = 0.82;
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
      roleScores: scoreByRole,
      style,
    };
  });

  return { layouts, blocks, baseFontSize, candidates };
}
