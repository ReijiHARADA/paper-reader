import type { LayoutBlock, LayoutLine, PageColumnLayout } from "./pdfLayout";

export type ExtractionDiagnostics = {
  columnConfidence: number;
  readingOrderConfidence: number;
  unicodeConfidence: number;
  paragraphConfidence: number;
  layoutConfidence?: number;
  textIntegrityConfidence?: number;
  semanticConfidence?: number;
  formatConfidence?: number;
  relationConfidence?: number;
};

export type ExtractionConfidenceBand = "high" | "medium" | "low";

export function classifyExtractionConfidence(
  score: number
): ExtractionConfidenceBand {
  if (score >= 0.9) return "high";
  if (score >= 0.7) return "medium";
  return "low";
}

export function isLowExtractionConfidence(score: number | null | undefined): boolean {
  return (score ?? 1) < 0.7;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function round2(n: number): number {
  return Math.round(clamp01(n) * 100) / 100;
}

function unicodeConfidence(text: string): number {
  if (!text) return 0.4;
  let score = 1;
  const replacement = (text.match(/\uFFFD/g) ?? []).length;
  if (replacement > 0) score -= Math.min(0.6, 0.2 + replacement * 0.1);
  let controls = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) controls += 1;
  }
  if (controls > 0) score -= 0.25;
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 12) {
    const spaced = text.match(/\b[A-Za-z]\s+[A-Za-z]\s+[A-Za-z]/g);
    if (spaced) score -= 0.2;
  }
  return clamp01(score);
}

function columnConfidence(
  block: LayoutBlock,
  layout: PageColumnLayout | undefined
): number {
  if (!layout) return 0.85;
  if (!layout.isMultiColumn) return 0.93;
  if (block.column === "left" || block.column === "right") return 0.95;
  if (block.column === "spanning") {
    const wide = block.bbox.width > layout.pageWidth * 0.48;
    return wide ? 0.92 : 0.72;
  }
  return 0.88;
}

function readingOrderConfidence(lines: LayoutLine[]): number {
  if (lines.length <= 1) return 0.94;
  let score = 0.96;
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const cur = lines[i];
    if (cur.page === prev.page && cur.column === prev.column && cur.y + 1 < prev.y) {
      score -= 0.18;
    }
    if (cur.column !== prev.column && cur.page === prev.page) {
      const leftRightFlip =
        (prev.column === "right" && cur.column === "left") ||
        (prev.column === "left" && cur.column === "right" && cur.y + 8 < prev.y);
      if (leftRightFlip) score -= 0.12;
    }
  }
  return clamp01(score);
}

function paragraphConfidence(block: LayoutBlock): number {
  const text = block.text.trim();
  let score = 0.95;
  if (block.role === "paragraph") {
    if (/^(figure|fig\.?|table)\s*\d+/i.test(text)) score -= 0.35;
    if (text.length < 12) score -= 0.12;
    if (/^\d+(\.\d+)*\.?\s+[A-Z].{0,40}$/.test(text) && text.length < 80) {
      score -= 0.2;
    }
  }
  if (block.role === "heading" && text.length > 160) score -= 0.25;
  if (block.role === "paragraph" && /\n/.test(block.text) === false) {
    const headingLike = /^(abstract|introduction|references|conclusion)\b/i.test(
      text
    );
    if (headingLike && text.length > 80) score -= 0.2;
  }
  return clamp01(score);
}

export function scoreLayoutBlock(
  block: LayoutBlock,
  layout?: PageColumnLayout
): { score: number; diagnostics: ExtractionDiagnostics } {
  const diagnostics: ExtractionDiagnostics = {
    columnConfidence: round2(columnConfidence(block, layout)),
    readingOrderConfidence: round2(readingOrderConfidence(block.lines)),
    unicodeConfidence: round2(unicodeConfidence(block.text)),
    paragraphConfidence: round2(paragraphConfidence(block)),
  };
  const score = round2(
    (diagnostics.columnConfidence +
      diagnostics.readingOrderConfidence +
      diagnostics.unicodeConfidence +
      diagnostics.paragraphConfidence) /
      4
  );
  return { score, diagnostics };
}
