/**
 * PDF reading-order reconstruction.
 *
 * ACM-style 2-column pages are read:
 *   left column top → bottom, then right column top → bottom.
 * Items are never sorted by Y across columns (that interleaves
 * left and right lines into nonsense sentences).
 */

import type { BoundingBox } from "../types/paper";
import type { ExtractedPage, ExtractedTextItem } from "./pdfService";
import {
  isReferencesHeading,
  looksLikeSubjectClassification,
  toHalfwidthAscii,
} from "./translation/quality";

export type LayoutColumn = "left" | "right" | "spanning" | "single";

export type LayoutRole =
  | "header"
  | "footer"
  | "title"
  | "author"
  | "affiliation"
  | "heading"
  | "paragraph"
  | "figure_caption"
  | "table_caption"
  | "equation"
  | "footnote"
  | "copyright";

export type PageColumnLayout = {
  page: number;
  pageWidth: number;
  pageHeight: number;
  isMultiColumn: boolean;
  gutterX: number;
  leftX: number;
  rightX: number;
};

export type LayoutLine = {
  text: string;
  items: ExtractedTextItem[];
  page: number;
  column: LayoutColumn;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  bbox: BoundingBox;
  pageHeight?: number;
};

export type LayoutBlock = {
  role: LayoutRole;
  text: string;
  lines: LayoutLine[];
  pageStart: number;
  pageEnd: number;
  column: LayoutColumn;
  bbox: BoundingBox;
};

const HEADER_Y = 48;
const FOOTER_MARGIN = 38;
const MIN_COLUMN_ITEMS = 8;
const SPAN_WIDTH_RATIO = 0.48;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function unionBbox(items: ExtractedTextItem[], page: number): BoundingBox {
  const x = Math.min(...items.map((i) => i.x));
  const y = Math.min(...items.map((i) => i.y));
  const right = Math.max(...items.map((i) => i.x + i.width));
  const bottom = Math.max(...items.map((i) => i.y + i.height));
  return {
    page,
    x,
    y,
    width: right - x,
    height: Math.max(1, bottom - y),
  };
}

function blockBbox(lines: LayoutLine[]): BoundingBox {
  const boxes = lines.map((l) => l.bbox);
  const page = boxes[0]?.page ?? 1;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { page, x, y, width: right - x, height: Math.max(1, bottom - y) };
}

export function detectPageColumns(page: ExtractedPage): PageColumnLayout {
  const usable = page.textItems.filter((item) => {
    const inHeader = item.y < HEADER_Y;
    const inFooter = item.y > page.height - FOOTER_MARGIN;
    return !inHeader && !inFooter;
  });

  const fallback: PageColumnLayout = {
    page: page.pageNumber,
    pageWidth: page.width,
    pageHeight: page.height,
    isMultiColumn: false,
    gutterX: page.width / 2,
    leftX: 0,
    rightX: page.width / 2,
  };

  const longLines = usable.filter(
    (item) =>
      item.width >= page.width * 0.25 && item.width <= page.width * 0.55
  );
  const sample =
    longLines.length >= 8
      ? longLines
      : usable.filter((item) => item.width < page.width * SPAN_WIDTH_RATIO);

  if (sample.length < MIN_COLUMN_ITEMS * 2) {
    return fallback;
  }

  const peaks = findTwoXPeaks(
    sample.map((item) => item.x),
    page.width * 0.18
  );
  if (!peaks) {
    return fallback;
  }

  const [leftX, rightX] = peaks;
  const leftItems = sample.filter(
    (i) => Math.abs(i.x - leftX) <= Math.abs(i.x - rightX)
  );
  const rightItems = sample.filter(
    (i) => Math.abs(i.x - leftX) > Math.abs(i.x - rightX)
  );
  const leftShare = leftItems.length / sample.length;
  const rightShare = rightItems.length / sample.length;
  const leftLong = leftItems.filter(
    (i) => i.width >= page.width * 0.22 && i.width <= page.width * 0.55
  );
  const rightLong = rightItems.filter(
    (i) => i.width >= page.width * 0.22 && i.width <= page.width * 0.55
  );
  const isMultiColumn =
    leftItems.length >= MIN_COLUMN_ITEMS &&
    rightItems.length >= MIN_COLUMN_ITEMS &&
    leftLong.length >= MIN_COLUMN_ITEMS &&
    rightLong.length >= MIN_COLUMN_ITEMS &&
    rightX - leftX >= page.width * 0.22 &&
    leftShare >= 0.22 &&
    rightShare >= 0.22 &&
    leftShare <= 0.78 &&
    rightShare <= 0.78;

  if (!isMultiColumn) {
    return fallback;
  }

  const colWidth =
    median(longLines.map((item) => item.width)) || (rightX - leftX) * 0.8;
  const gutterX = (leftX + colWidth + rightX) / 2;

  return {
    page: page.pageNumber,
    pageWidth: page.width,
    pageHeight: page.height,
    isMultiColumn: true,
    gutterX,
    leftX,
    rightX,
  };
}

function findTwoXPeaks(
  xs: number[],
  minSeparation: number
): [number, number] | null {
  const binSize = 8;
  const bins = new Map<number, number>();
  for (const x of xs) {
    const bin = Math.round(x / binSize) * binSize;
    bins.set(bin, (bins.get(bin) || 0) + 1);
  }
  const ranked = [...bins.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  const first = ranked[0];
  const second = ranked.find((peak) => Math.abs(peak[0] - first[0]) >= minSeparation);
  if (!second || second[1] < Math.max(4, first[1] * 0.2)) return null;
  const left = Math.min(first[0], second[0]);
  const right = Math.max(first[0], second[0]);
  return [left, right];
}

function assignColumn(
  item: ExtractedTextItem,
  layout: PageColumnLayout
): LayoutColumn {
  if (!layout.isMultiColumn) return "single";

  if (item.width > layout.pageWidth * SPAN_WIDTH_RATIO) return "spanning";
  if (
    item.width > layout.pageWidth * 0.4 &&
    item.x < layout.gutterX - 20 &&
    item.x + item.width > layout.rightX + 20
  ) {
    return "spanning";
  }

  return item.x + item.width / 2 < layout.gutterX ? "left" : "right";
}

function joinItemTexts(items: ExtractedTextItem[]): string {
  const sorted = [...items].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length === 0) return "";

  let out = sorted[0].text;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const gap = cur.x - (prev.x + prev.width);
    const spaceThreshold = Math.max(1.1, prev.fontSize * 0.14);
    const needsSpace =
      gap > spaceThreshold && !/\s$/.test(out) && !/^\s/.test(cur.text);
    if (needsSpace) out += " ";
    out += cur.text;
  }
  return out.replace(/\s+/g, " ").trim();
}

function itemsToLine(
  items: ExtractedTextItem[],
  column: LayoutColumn,
  page: number,
  pageHeight?: number
): LayoutLine {
  const bbox = unionBbox(items, page);
  const fontSize =
    items.reduce((sum, i) => sum + i.fontSize, 0) / items.length;
  const bodyItems = items.filter((i) => i.fontSize >= fontSize * 0.82);
  const ySource = bodyItems.length > 0 ? bodyItems : items;
  return {
    text: joinItemTexts(items),
    items,
    page,
    column,
    x: bbox.x,
    y: median(ySource.map((i) => i.y)),
    width: bbox.width,
    height: bbox.height,
    fontSize,
    bbox,
    pageHeight,
  };
}

function clusterItemsIntoLines(
  items: ExtractedTextItem[],
  column: LayoutColumn,
  pageNumber: number,
  pageHeight?: number
): LayoutLine[] {
  if (items.length === 0) return [];

  const fontBase = median(items.map((i) => i.fontSize)) || 10;
  const yThreshold = Math.max(3.2, fontBase * 0.42);
  const bodyItems = items.filter((i) => i.fontSize >= fontBase * 0.82);
  const superItems = items.filter((i) => i.fontSize < fontBase * 0.82);
  const primary = bodyItems.length > 0 ? bodyItems : items;

  const sorted = [...primary].sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: ExtractedTextItem[][] = [];
  const groupY: number[] = [];

  for (const item of sorted) {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < groups.length; i++) {
      const dist = Math.abs(item.y - groupY[i]);
      if (dist <= yThreshold && dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }
    if (best === -1) {
      groups.push([item]);
      groupY.push(item.y);
    } else {
      groups[best].push(item);
      groupY[best] = median(groups[best].map((g) => g.y));
    }
  }

  for (const item of superItems) {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < groups.length; i++) {
      const minX = Math.min(...groups[i].map((g) => g.x));
      const maxX = Math.max(...groups[i].map((g) => g.x + g.width));
      const xNear = item.x >= minX - 24 && item.x <= maxX + 24;
      const dist = Math.abs(item.y - groupY[i]);
      if (xNear && dist < fontBase * 0.95 && dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }
    if (best >= 0) {
      groups[best].push(item);
    } else {
      groups.push([item]);
      groupY.push(item.y);
    }
  }

  return groups
    .map((group) => itemsToLine(group, column, pageNumber, pageHeight))
    .filter((line) => line.text.length > 0)
    .sort((a, b) => a.y - b.y);
}

function isRepeatedHeaderFooter(text: string, patterns: Set<string>): boolean {
  return patterns.has(normalizeChromeKey(text));
}

function normalizeChromeKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ");
}

function detectHeaderFooterPatterns(pages: ExtractedPage[]): Set<string> {
  const counts = new Map<string, number>();
  for (const page of pages) {
    const topBand = Math.max(HEADER_Y, page.height * 0.08);
    const bottomBand = Math.max(FOOTER_MARGIN, page.height * 0.07);
    const edge = page.textItems.filter(
      (i) => i.y < topBand || i.y > page.height - bottomBand
    );
    const seen = new Set<string>();
    for (const item of edge) {
      const key = normalizeChromeKey(item.text);
      if (key.length < 4 || key.length > 140) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const patterns = new Set<string>();
  const threshold = Math.max(2, Math.floor(pages.length * 0.28));
  for (const [text, count] of counts) {
    if (count >= threshold) patterns.add(text);
  }
  return patterns;
}

function isEdgeChrome(
  line: LayoutLine,
  layout: PageColumnLayout,
  patterns: Set<string>
): boolean {
  if (isFootnoteLine(line, layout.pageHeight, line.fontSize)) return false;
  const topBand = Math.max(HEADER_Y, layout.pageHeight * 0.08);
  if (line.y < topBand) return true;
  if (line.y > layout.pageHeight - FOOTER_MARGIN) return true;
  if (/^\d{1,3}$/.test(line.text.trim())) return true;
  if (patterns.has(normalizeChromeKey(line.text))) return true;
  if (isRepeatedHeaderFooter(line.text, patterns)) return true;
  if (
    /^(proceedings of|conference on|extended abstracts|tei\s+[’']?\d{2,4}|chi\s+[’']?\d{2,4}|uist\s+[’']?\d{2,4}|iswc\s+[’']?\d{2,4}|dis\s+[’']?\d{2,4}|cscw|imwut|ubicomp)/i.test(
      line.text.trim()
    )
  ) {
    return true;
  }
  return false;
}

function layoutPlain(text: string): string {
  return toHalfwidthAscii(text).replace(/．/g, ".").trim();
}

export function displayHeadingText(text: string): string {
  const cleaned = layoutPlain(text).replace(
    /^\d{1,3}\s+(?=\d{1,2}(?:\.\d{1,2})+\.?\s+\S)/,
    ""
  );
  return cleaned || text.trim();
}

function cjkCount(text: string): number {
  return (text.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) || []).length;
}

export function isFigureCaption(text: string): boolean {
  return /^(?:figure|fig\.?|図)\s*\d+[a-z]?(?:\s*,\s*[a-z]\b)*(?:\s*[:.：–—-]|\s*$)/i.test(
    layoutPlain(text)
  );
}

export function isTableCaption(text: string): boolean {
  return /^(?:tables?|表)\s*(?:\d+[a-z]?|[ivxlcdm]+)(?:\s*[:.：–—-]|\s*$)/i.test(
    layoutPlain(text)
  );
}

function isCopyright(text: string, fontSize: number, baseFont: number): boolean {
  if (fontSize > baseFont * 0.92) return false;
  return /permission to make digital or hard copies/i.test(text);
}

function isFootnoteLine(
  line: { text: string; y: number; fontSize: number },
  pageHeight: number,
  baseFont: number
): boolean {
  const t = layoutPlain(line.text);
  if (!t) return false;
  if (line.fontSize > baseFont * 0.9 && line.fontSize > 9.2) return false;
  if (line.y < pageHeight * 0.7) return false;
  if (!/^(?:\*|†|‡|§|\d{1,2}|\[\d+\])\s+\S/.test(t)) return false;
  const afterMark = t.replace(/^(?:\*|†|‡|§|\d{1,2}|\[\d+\])\s+/, "");
  if (looksLikeSectionNumberedHeading(t) || looksLikeSectionNumberedHeading(afterMark)) {
    return false;
  }
  if (NAMED_HEADINGS.some((re) => re.test(afterMark))) return false;
  return true;
}

const BODY_START_HEADING =
  /^(?:(?:\d+\.)\s*)?(abstract|introduction|author keywords?|ccs concepts|index terms|keywords|はじめに|序論|序言|まえがき)\s*$/i;

function isBodyStartHeading(text: string): boolean {
  const t = layoutPlain(text);
  if (BODY_START_HEADING.test(t)) return true;
  return looksLikeSectionNumberedHeading(t);
}

export function looksLikeUrl(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/https?:\/\//i.test(t)) return true;
  if (/\bdoi:\s*10\./i.test(t) || /\bdoi\.org\b/i.test(t)) return true;
  if (/[?&][a-z_][a-z0-9_]*=/i.test(t)) return true;
  if (/\.(?:pdf|html?|aspx?)\b/i.test(t) && /[/=?&]/.test(t)) return true;
  return false;
}

const MATH_SYMBOLS = /[=+×÷∑∫√∞≈≠≤≥±∂∇]/g;
const FUNCTION_WORD =
  /^(the|a|an|of|and|or|to|in|on|for|from|with|when|that|this|is|as|by|into|account|not|yet|been|than|its|their)$/i;

/**
 * Displayed equations, not hyphenated English or bibliography URLs.
 * ASCII "-" is a word hyphen far more often than a minus sign.
 */
export function isEquationLine(text: string): boolean {
  const t = text.trim();
  if (t.length < 3 || t.length > 140) return false;
  if (isFigureCaption(t) || isTableCaption(t)) return false;
  if (looksLikeUrl(t) || looksLikeEmail(t)) return false;
  if (/^(abstract|introduction|references|acknowledgements?)\b/i.test(t)) {
    return false;
  }

  const mathSymbols = t.match(MATH_SYMBOLS)?.length ?? 0;
  const minusOps =
    t.match(
      /(?:[A-Za-z0-9]\s+[−-]\s+[A-Za-z0-9]|[^\w]\s*−\s*[^\w])/g
    )?.length ?? 0;
  const greek = t.match(/[α-ωΑ-Ω](?![a-z])/g)?.length ?? 0;
  const math = mathSymbols + minusOps + greek;
  const hasEqNumber = /\(\s*\d{1,2}[a-z]?\s*\)\s*$/.test(t);

  if (math === 0 && !hasEqNumber) return false;

  const tokens = t.split(/\s+/);
  const functionWords = tokens.filter((w) =>
    FUNCTION_WORD.test(w.replace(/[^A-Za-z]/g, ""))
  ).length;
  if (functionWords >= 3) return false;

  if (hasEqNumber && math >= 1) return true;
  if (math < 2) return false;
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  if (letters > 48 && math < 3) return false;
  return tokens.length <= 24;
}

function captionShouldContinue(currentText: string, next: LayoutLine, baseFont: number): boolean {
  const nextText = next.text.trim();
  if (!nextText) return false;
  if (isHeadingLine(next, baseFont)) return false;
  if (/^(abstract|introduction|ccs concepts|author keywords?|index terms|keywords)\b/i.test(nextText)) {
    return false;
  }
  if (looksLikeEmail(nextText) || looksLikeAffiliation(nextText)) return false;
  if (isCopyright(nextText, next.fontSize, baseFont)) return false;
  if (/[.!?]\s*$/.test(currentText) && /^[A-Z*]/.test(nextText) && nextText.length > 70) {
    return false;
  }
  return true;
}

const NAMED_HEADINGS = [
  /^abstract$/i,
  /^author keywords?$/i,
  /^acm classification keywords?$/i,
  /^ccs concepts$/i,
  /^introduction$/i,
  /^related work$/i,
  /^background$/i,
  /^conclusions?$/i,
  /^discussion$/i,
  /^references$/i,
  /^acknowledgements?$/i,
  /^method(s|ology)?$/i,
  /^results?$/i,
  /^はじめに$/,
  /^関連研究$/,
  /^背景$/,
  /^まとめ$/,
  /^おわりに$/,
  /^結論$/,
  /^考察$/,
  /^謝辞$/,
  /^参考文献$/,
  /^引用文献$/,
];

function looksLikeGrantIdentifier(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^\d{3,}(?:\.\d+){1,}$/.test(t)) return true;
  if (/^0\d+(?:\.\d+)+$/.test(t)) return true;
  const dotted = t.match(/^(\d+)(?:\.(\d+)){2,}$/);
  if (dotted && (dotted[1].length >= 3 || /^0/.test(dotted[1]))) return true;
  return false;
}

function startsWithGrantIdentifier(text: string): boolean {
  const first = (text.trim().split(/\s+/)[0] ?? "").replace(/[,;:]$/, "");
  return looksLikeGrantIdentifier(first);
}

function looksLikeSectionNumberedHeading(text: string): boolean {
  const t = layoutPlain(text).replace(
    /^\d{1,3}\s+(?=\d{1,2}(?:\.\d{1,2})+\.?\s+\S)/,
    ""
  );
  const match = t.match(/^(\d{1,2})((?:\.\d{1,2}){0,3})\.?\s+(.+)$/);
  if (!match) return false;
  if (/^0/.test(match[1])) return false;
  const rest = match[3].trim();
  if (!rest || rest.length > 70) return false;
  if (/[。．]/.test(rest)) return false;
  const first = rest.split(/\s+/)[0] ?? "";
  if (looksLikeGrantIdentifier(first) || looksLikeGrantIdentifier(rest)) {
    return false;
  }
  if (cjkCount(rest) >= 2) {
    const hadSinglePeriod = match[2] === "" && /^\d+\.\s+/.test(t);
    if (hadSinglePeriod && (rest.length > 20 || /[，,]/.test(rest))) {
      return false;
    }
    if (rest.length > 40 || /^[(（]/.test(rest)) return false;
    if (/[。．.]$/.test(rest) || /[，,]/.test(rest)) return false;
    return true;
  }
  if (!/^[A-Z(]/.test(rest)) return false;
  if (/[。.]$/.test(rest) && rest.length > 24) return false;
  if (match[2] === "" && /^\d+\.\s+/.test(t)) {
    // "6. Martin A. Conway..." is a bibliography item, not "6. Results"
    if (/\b(19|20)\d{2}\b/.test(rest) || /\b[A-Z]\.\s+[A-Z]/.test(rest)) {
      return false;
    }
    if (/\band\b/.test(rest) && /[A-Z][a-z]+\s+[A-Z]/.test(rest)) return false;
  }
  return rest.split(/\s+/).length <= 10;
}

function isGrantNumberContinuation(previous: string, next: string): boolean {
  const a = previous.trim();
  const b = next.trim();
  if (!a || !b) return false;
  if (/[.!?]$/.test(a)) return false;
  const nextFirst = b.split(/\s+/)[0] ?? b;
  if (
    /\b(?:grant|award|project|contract)\s+(?:numbers?|no\.?|#)\s*$/i.test(a) &&
    /^\d/.test(b)
  ) {
    return true;
  }
  if (/\bnumbers?\s*$/i.test(a) && looksLikeGrantIdentifier(nextFirst)) {
    return true;
  }
  if (!/[.!?]$/.test(a) && looksLikeGrantIdentifier(nextFirst)) {
    return true;
  }
  // "...grant number 016.128.303" wrapping onto "Research (NWO), awarded..."
  if (
    /\b(?:grant|award|project|contract)\s+(?:numbers?|no\.?|#)\b/i.test(a) &&
    /\d+(?:\.\d+){1,}/.test(a) &&
    /^[A-Z(]/.test(b) &&
    !looksLikeSectionNumberedHeading(b) &&
    !NAMED_HEADINGS.some((re) => re.test(b))
  ) {
    return true;
  }
  return false;
}

function isHeadingLine(line: LayoutLine, baseFont: number): boolean {
  const text = layoutPlain(line.text);
  if (!text || text.length > 90) return false;
  if (looksLikeGrantIdentifier(text) || startsWithGrantIdentifier(text)) {
    return false;
  }
  if (looksLikePaperCode(text)) return false;
  if (looksLikeSubjectClassification(text)) return false;
  if (isFigureCaption(text) || isTableCaption(text)) return false;
  if (looksLikeEmail(text) || looksLikeUrl(text) || looksLikeAffiliation(text)) {
    return false;
  }
  if (/^[a-z]/.test(text)) return false;
  if (/[-–—]$/.test(text) && text.split(/\s+/).length >= 4) return false;
  if (/^\d+\.\s+[A-Z]/.test(text) && !/^\d+\.\d+/.test(text)) {
    // "6. Martin A. Conway..." is a bibliography item, not "6. Results"
    if (/\b(19|20)\d{2}\b/.test(text) || /\b[A-Z]\.\s+[A-Z]/.test(text)) {
      return false;
    }
    if (/\band\b/.test(text) && /[A-Z][a-z]+\s+[A-Z]/.test(text)) return false;
  }
  if (NAMED_HEADINGS.some((re) => re.test(text))) return true;
  if (looksLikeSectionNumberedHeading(text)) return true;
  if (/^\d+\.?\s+[A-Z][A-Za-z].{0,40}$/.test(text) && text.split(/\s+/).length <= 8) {
    if (!/,/.test(text) && !/\b(19|20)\d{2}\b/.test(text) && !looksLikeGrantIdentifier(text)) {
      return true;
    }
  }
  const letters = text.replace(/[^A-Za-z]/g, "");
  const upper = text.replace(/[^A-Z]/g, "");
  if (letters.length >= 6 && upper.length / letters.length > 0.72) return true;
  if (line.fontSize > baseFont * 1.28 && text.length < 80 && text.split(/\s+/).length <= 12) {
    if (!/[A-Za-z]{3,}/.test(text)) return false;
    if (/[.!?。．]$/.test(text) && text.split(/\s+/).length > 6) return false;
    if (looksLikePersonName(text)) return false;
    return true;
  }
  return false;
}

function looksLikeEmail(text: string): boolean {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
}

function looksLikeAffiliation(text: string): boolean {
  return /(university|department|institute|college|faculty|laboratory|\blab\b|research (center|centre)|school of|architecture|industrial design|centre of excellence|faculty of|department of|\b(?:the )?(netherlands|australia|germany|france|japan|china|canada|sweden|denmark|finland|norway|italy|spain|switzerland|austria|belgium|ireland|scotland|england|wales)\b|\b(?:sydney|london|dundee|eindhoven|cambridge|oxford|toronto|melbourne|macquarie)\b|大学|大学院|研究所|学院|学部|学科|機構|高専)/i.test(
    text
  );
}

function looksLikePaperCode(text: string): boolean {
  return /^[A-Z]{1,3}-\d{2,4}$/.test(layoutPlain(text));
}

function looksLikeLatinAuthorLine(text: string): boolean {
  if (looksLikeEmail(text) || looksLikeAffiliation(text) || looksLikeUrl(text)) {
    return false;
  }
  if (looksLikePaperCode(text) || looksLikePersonName(text)) return false;
  const t = layoutPlain(text)
    .replace(/[*,†‡§]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cjkCount(t) > 0 || t.length > 80 || t.length < 6) return false;
  if (/^\d/.test(t) || /[@/]/.test(t)) return false;
  const caps = t.split(/\s+/).filter((w) => {
    const fold = foldNameToken(w);
    return /^[A-Z][A-Za-z.'’-]*$/.test(fold) && fold.length >= 2;
  });
  const words = t.split(/\s+/).filter(Boolean);
  return caps.length >= 2 && caps.length <= 8 && caps.length >= words.length - 2;
}

const NAME_PARTICLE = /^(van|von|de|den|der|di|da|la|le|du|del|st|ter|bin|al)$/i;
const NAME_JOINER = /^(and|&)$/i;

function foldNameToken(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u00AF\u02C9\u203E]/g, "")
    .replace(/[^\p{L}.''’-]/gu, "");
}

function isNameToken(part: string, parts: string[]): boolean {
  if (/^[\u3040-\u30ff\u4e00-\u9fff]{1,4}$/.test(part)) return true;
  const fold = foldNameToken(part);
  if (/^[A-Z][A-Za-z.'’-]*$/.test(fold)) return true;
  if (/^[A-Z]\.$/.test(fold) || /^[A-Z]$/.test(fold)) return true;
  const hasMacronStub = parts.some((p) => {
    const f = foldNameToken(p);
    return /^[A-Z]$/.test(f) || /[\u00AF\u0304]$/.test(p);
  });
  if (/^[a-z]{2,6}$/.test(fold) && hasMacronStub) return true;
  return false;
}

function looksLikePersonName(text: string): boolean {
  if (looksLikeEmail(text) || looksLikeAffiliation(text) || looksLikeUrl(text)) {
    return false;
  }
  const cleaned = layoutPlain(text)
    .replace(/[*,†‡§]/g, " ")
    .replace(/(\p{L})\d+/gu, "$1")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length > 80 || cleaned.length < 3) return false;
  if (/^\d/.test(cleaned)) return false;
  const parts = cleaned.split(/\s+/);
  if (parts.length < 2 || parts.length > 12) return false;
  const nameParts = parts.filter((p) => !NAME_PARTICLE.test(p) && !NAME_JOINER.test(p));
  if (nameParts.length < 2) return false;
  if (!nameParts.every((p) => isNameToken(p, nameParts))) return false;
  const substantial = nameParts.filter((p) => {
    if (/^[\u3040-\u30ff\u4e00-\u9fff]{1,4}$/.test(p)) return true;
    const fold = foldNameToken(p);
    return /^[A-Z][A-Za-z.'’-]*$/.test(fold);
  });
  return substantial.length >= 2;
}

function detectTitleFont(lines: LayoutLine[], baseFont: number): number {
  const pageOne = lines.filter((l) => l.page === 1 && l.text.trim().length >= 8);
  if (pageOne.length === 0) return 0;
  const maxFont = Math.max(...pageOne.map((l) => l.fontSize));
  if (maxFont < baseFont * 1.28) return 0;
  return maxFont;
}

function looksLikeTitleLine(
  line: LayoutLine,
  titleFont: number,
  baseFont: number
): boolean {
  if (line.page !== 1 || titleFont <= 0) return false;
  if (line.fontSize < titleFont * 0.9) return false;
  if (line.fontSize < baseFont * 1.28) return false;
  const text = line.text.trim();
  if (text.length < 8 || text.length > 180) return false;
  if (isBodyStartHeading(text) || NAMED_HEADINGS.some((re) => re.test(text))) {
    return false;
  }
  if (looksLikeEmail(text) || looksLikeAffiliation(text) || looksLikeUrl(text)) {
    return false;
  }
  if (looksLikePaperCode(text)) return false;
  return true;
}

function joinHyphenated(prev: string, next: string): string {
  if (prev.endsWith("-") && /^[a-z]/.test(next)) {
    // "jewellery-, memory- and interaction-" + "perspectives"
    if (/(?:,|and)\s+[A-Za-z]+-$/i.test(prev)) {
      return prev + next;
    }
    return prev.slice(0, -1) + next;
  }
  return `${prev} ${next}`;
}

function joinLines(lines: LayoutLine[]): string {
  if (lines.length === 0) return "";
  let text = lines[0].text.trim();
  for (let i = 1; i < lines.length; i++) {
    const next = lines[i].text.trim();
    if (!next) continue;
    text = joinHyphenated(text, next);
  }
  return text.replace(/\s+/g, " ").trim();
}

function sortColumnLines(lines: LayoutLine[]): LayoutLine[] {
  return [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * 2-column reading order:
 * spanning top → left column (all) → right column (all) → spanning bottom.
 * Mid-page spanning bands (full-width figures) split the page so captions
 * are not dropped into the other column's sentences.
 */
function orderPageLines(lines: LayoutLine[], layout: PageColumnLayout): LayoutLine[] {
  if (!layout.isMultiColumn) {
    return sortColumnLines(lines);
  }

  const left = sortColumnLines(lines.filter((l) => l.column === "left"));
  const right = sortColumnLines(lines.filter((l) => l.column === "right"));
  const spanning = sortColumnLines(lines.filter((l) => l.column === "spanning"));

  const columnTop = Math.min(
    left[0]?.y ?? Infinity,
    right[0]?.y ?? Infinity
  );
  const columnBottom = Math.max(
    left[left.length - 1]?.y ?? 0,
    right[right.length - 1]?.y ?? 0
  );

  const spanningTop = spanning.filter((l) => l.y < columnTop - 6);
  const spanningMid = spanning.filter(
    (l) => l.y >= columnTop - 6 && l.y <= columnBottom + 6
  );
  const spanningBottom = spanning.filter((l) => l.y > columnBottom + 6);

  if (spanningMid.length === 0) {
    return [...spanningTop, ...left, ...right, ...spanningBottom];
  }

  const cuts = spanningMid.map((l) => l.y).sort((a, b) => a - b);
  const result: LayoutLine[] = [...spanningTop];
  let prevCut = -Infinity;
  for (const cut of cuts) {
    result.push(...left.filter((l) => l.y > prevCut && l.y < cut - 4));
    result.push(...right.filter((l) => l.y > prevCut && l.y < cut - 4));
    result.push(...spanningMid.filter((l) => Math.abs(l.y - cut) < 1));
    prevCut = cut;
  }
  result.push(...left.filter((l) => l.y > prevCut));
  result.push(...right.filter((l) => l.y > prevCut));
  result.push(...spanningBottom);
  return result;
}

function buildPageLines(
  page: ExtractedPage,
  layout: PageColumnLayout,
  patterns: Set<string>
): LayoutLine[] {
  const buckets: Record<LayoutColumn, ExtractedTextItem[]> = {
    left: [],
    right: [],
    spanning: [],
    single: [],
  };
  for (const item of page.textItems) {
    if (!item.text.trim()) continue;
    const column = assignColumn(item, layout);
    buckets[column].push(item);
  }

  const lines: LayoutLine[] = [];
  (["spanning", "left", "right", "single"] as LayoutColumn[]).forEach((column) => {
    lines.push(
      ...clusterItemsIntoLines(buckets[column], column, page.pageNumber, layout.pageHeight)
    );
  });

  const visible = lines.filter((line) => !isEdgeChrome(line, layout, patterns));
  const splitCandidates = visible.filter((line) => isBodyStartHeading(line.text));
  const splitAt =
    splitCandidates.length > 0
      ? splitCandidates.reduce((best, line) => (line.y < best.y ? line : best))
      : visible.find((line) => /^(abstract|introduction)$/i.test(line.text.trim()));
  if (layout.isMultiColumn && splitAt && page.pageNumber === 1) {
    const masthead = visible.filter((line) => line.y < splitAt.y);
    const body = visible.filter((line) => line.y >= splitAt.y);
    return [...orderPageLines(masthead, layout), ...orderPageLines(body, layout)];
  }

  return orderPageLines(visible, layout);
}

function isLongBodyLine(text: string): boolean {
  const t = layoutPlain(text);
  if (t.length > 50) return true;
  return cjkCount(t) >= 18;
}

function detectMastheadEnd(lines: LayoutLine[], baseFont: number): number {
  const pageOne = lines.filter((l) => l.page === 1);
  if (pageOne.length === 0) return -1;

  const named = pageOne.filter((l) => isBodyStartHeading(l.text));
  if (named.length > 0) {
    return Math.min(...named.map((l) => l.y));
  }

  const titleFont = detectTitleFont(pageOne, baseFont);
  const title = pageOne.find((l) => looksLikeTitleLine(l, titleFont, baseFont));
  const afterTitle = title ? title.y + Math.max(18, title.height) : 70;
  const body = pageOne.find(
    (l) =>
      l.y > afterTitle &&
      l.fontSize <= baseFont * 1.08 &&
      isLongBodyLine(l.text) &&
      !looksLikeEmail(l.text) &&
      !looksLikeAffiliation(l.text) &&
      !looksLikePersonName(l.text)
  );
  return body ? body.y : -1;
}

function roleForLine(
  line: LayoutLine,
  baseFont: number,
  mastheadEndY: number,
  inCopyright: boolean,
  titleFont: number
): LayoutRole {
  const text = line.text.trim();
  if (isCopyright(text, line.fontSize, baseFont) || inCopyright) {
    return "copyright";
  }
  if (isFigureCaption(text)) return "figure_caption";
  if (isTableCaption(text)) return "table_caption";
  if (isEquationLine(text)) return "equation";
  if (isFootnoteLine(line, line.pageHeight ?? 792, baseFont)) {
    if (line.page === 1 && looksLikeAffiliation(text)) return "affiliation";
    return "footnote";
  }

  if (looksLikeTitleLine(line, titleFont, baseFont)) return "title";

  const inMasthead =
    line.page === 1 && mastheadEndY >= 0 && line.y < mastheadEndY;
  if (inMasthead) {
    if (looksLikeGrantIdentifier(text) || startsWithGrantIdentifier(text)) {
      return "paragraph";
    }
    if (looksLikePaperCode(text)) return "affiliation";
    if (
      looksLikeEmail(text) ||
      looksLikePersonName(text) ||
      looksLikeLatinAuthorLine(text)
    ) {
      return "author";
    }
    return "affiliation";
  }

  if (isHeadingLine(line, baseFont)) return "heading";
  return "paragraph";
}

function canMerge(prev: LayoutLine, next: LayoutLine, baseFont: number): boolean {
  if (prev.page !== next.page) return false;
  if (prev.column !== next.column) return false;
  const baselineGap = next.y - prev.y;
  if (baselineGap > baseFont * 1.55) return false;
  return true;
}

function groupLinesIntoBlocks(
  lines: LayoutLine[],
  baseFont: number
): LayoutBlock[] {
  const mastheadEndY = detectMastheadEnd(lines, baseFont);
  const titleFont = detectTitleFont(lines, baseFont);
  const blocks: LayoutBlock[] = [];
  let current: LayoutLine[] = [];
  let currentRole: LayoutRole | null = null;
  let copyrightStarted = false;
  let copyrightPage = -1;
  let copyrightColumn: LayoutColumn | null = null;
  let inReferences = false;

  const flush = () => {
    if (current.length === 0 || !currentRole) return;
    blocks.push({
      role: currentRole,
      text: joinLines(current),
      lines: current,
      pageStart: current[0].page,
      pageEnd: current[current.length - 1].page,
      column: current[0].column,
      bbox: blockBbox(current),
    });
    current = [];
    currentRole = null;
  };

  for (const line of lines) {
    if (!line.text.trim()) continue;
    if (line.page !== copyrightPage || line.column !== copyrightColumn) {
      copyrightStarted = false;
    }
    if (isCopyright(line.text, line.fontSize, baseFont)) {
      copyrightStarted = true;
      copyrightPage = line.page;
      copyrightColumn = line.column;
    }
    const role = roleForLine(line, baseFont, mastheadEndY, copyrightStarted, titleFont);
    if (isReferencesHeading(line.text)) {
      inReferences = true;
    }
    let forcedRole =
      inReferences &&
      role === "heading" &&
      !isReferencesHeading(line.text)
        ? "paragraph"
        : role;
    if (
      currentRole === "paragraph" &&
      forcedRole === "heading" &&
      isGrantNumberContinuation(joinLines(current), line.text)
    ) {
      forcedRole = "paragraph";
    }
    const atomic = forcedRole === "heading";

    if (currentRole === null) {
      current = [line];
      currentRole = forcedRole;
      if (atomic) {
        flush();
      }
      continue;
    }

    const sameRole = forcedRole === currentRole;
    const authorKindOk =
      currentRole !== "author" ||
      looksLikeEmail(joinLines(current)) === looksLikeEmail(line.text);
    const mergeable =
      sameRole &&
      !atomic &&
      authorKindOk &&
      currentRole !== "heading" &&
      currentRole !== "title" &&
      currentRole !== "figure_caption" &&
      currentRole !== "table_caption" &&
      currentRole !== "footnote" &&
      canMerge(current[current.length - 1], line, baseFont);

    const grantContinue =
      currentRole === "paragraph" &&
      forcedRole === "paragraph" &&
      line.page === current[current.length - 1].page &&
      line.column === current[current.length - 1].column &&
      line.y - current[current.length - 1].y < baseFont * 3.2 &&
      isGrantNumberContinuation(joinLines(current), line.text);

    const titleContinue =
      currentRole === "title" &&
      forcedRole === "title" &&
      line.page === current[0].page &&
      line.y - current[current.length - 1].y < baseFont * 2.8;

    const captionContinue =
      (currentRole === "figure_caption" || currentRole === "table_caption") &&
      line.page === current[0].page &&
      line.column === current[0].column &&
      line.y - current[current.length - 1].y < baseFont * 2.4 &&
      line.fontSize <= current[0].fontSize + 0.6 &&
      captionShouldContinue(joinLines(current), line, baseFont);

    const footnoteContinue =
      currentRole === "footnote" &&
      forcedRole === "footnote" &&
      line.page === current[0].page &&
      line.y - current[current.length - 1].y < baseFont * 2.2;

    if (mergeable || captionContinue || grantContinue || titleContinue || footnoteContinue) {
      current.push(line);
      continue;
    }

    flush();
    current = [line];
    currentRole = forcedRole;
    if (atomic) {
      flush();
    }
  }
  flush();
  return mergeColumnContinuations(blocks.filter((b) => b.text.length > 0));
}

function isSentenceContinuation(left: string, right: string): boolean {
  const a = left.trim();
  const b = right.trim();
  if (!a || !b) return false;
  if (/[.!?]$/.test(a)) return false;
  if (a.endsWith("-") && /^[a-z]/.test(b)) return true;
  if (isGrantNumberContinuation(a, b)) return true;
  return /^[a-z(]/.test(b);
}

function mergeColumnContinuations(blocks: LayoutBlock[]): LayoutBlock[] {
  const result: LayoutBlock[] = [];
  for (const block of blocks) {
    let targetIdx = result.length - 1;
    while (
      targetIdx >= 0 &&
      (result[targetIdx].role === "copyright" ||
        result[targetIdx].role === "header" ||
        result[targetIdx].role === "footer")
    ) {
      targetIdx--;
    }
    const target = targetIdx >= 0 ? result[targetIdx] : null;
    if (
      target &&
      target.role === "paragraph" &&
      block.role === "paragraph" &&
      target.column === "left" &&
      block.column === "right" &&
      target.pageEnd === block.pageStart &&
      isSentenceContinuation(target.text, block.text)
    ) {
      target.text = joinHyphenated(target.text, block.text).replace(/\s+/g, " ").trim();
      target.lines = [...target.lines, ...block.lines];
      target.pageEnd = block.pageEnd;
      target.bbox = blockBbox(target.lines);
      continue;
    }
    result.push(block);
  }
  return result;
}

function columnBand(
  column: LayoutColumn,
  layout: PageColumnLayout
): { x: number; width: number } {
  const leftMargin = Math.max(layout.leftX - 10, 18);
  const rightMargin = 18;
  if (!layout.isMultiColumn || column === "spanning" || column === "single") {
    return {
      x: leftMargin,
      width: Math.max(40, layout.pageWidth - leftMargin - rightMargin),
    };
  }
  if (column === "left") {
    return {
      x: leftMargin,
      width: Math.max(40, layout.gutterX - leftMargin - 10),
    };
  }
  return {
    x: layout.gutterX + 8,
    width: Math.max(40, layout.pageWidth - layout.gutterX - 8 - rightMargin),
  };
}

function overlapsBand(
  box: BoundingBox,
  band: { x: number; width: number }
): boolean {
  return box.x < band.x + band.width && band.x < box.x + box.width;
}

function isSubstantialCropBound(block: LayoutBlock): boolean {
  if (
    block.role === "heading" ||
    block.role === "title" ||
    block.role === "figure_caption" ||
    block.role === "table_caption" ||
    block.role === "author" ||
    block.role === "affiliation"
  ) {
    return true;
  }
  if (block.role === "paragraph") {
    return block.text.replace(/\s+/g, " ").trim().length >= 48;
  }
  return false;
}

export function figureLookupKey(text: string, page: number): string {
  const match = layoutPlain(text).match(/^(?:figure|fig\.?|tables?|図|表)\s*(\d+[a-z]?)/i);
  return match ? `${page}:${match[1]}` : `${page}:${text.slice(0, 48)}`;
}

/**
 * Region immediately above a figure caption, used to rasterize the figure.
 * Top-origin coordinates, matching layout bboxes.
 */
export function figureImageRect(
  caption: LayoutBlock,
  blocks: LayoutBlock[],
  layout: PageColumnLayout
): BoundingBox | null {
  const band = columnBand(caption.column, layout);
  const captionTop = caption.bbox.y;
  let topBound = HEADER_Y;

  for (const block of blocks) {
    if (block.pageStart !== caption.pageStart) continue;
    if (
      block.role === caption.role &&
      block.text === caption.text &&
      Math.abs(block.bbox.y - caption.bbox.y) < 0.5
    ) {
      continue;
    }
    if (
      block.role === "header" ||
      block.role === "footer" ||
      block.role === "copyright"
    ) {
      continue;
    }
    if (!isSubstantialCropBound(block)) continue;
    const blockBottom = block.bbox.y + block.bbox.height;
    if (blockBottom > captionTop - 2) continue;
    if (!overlapsBand(block.bbox, band)) continue;
    if (blockBottom > topBound) topBound = blockBottom;
  }

  const pad = 3;
  let y = topBound + pad;
  const bottom = captionTop - pad;
  let height = bottom - y;
  if (height < 36) return null;

  const maxHeight = layout.pageHeight * 0.58;
  if (height > maxHeight) {
    y = bottom - maxHeight;
    height = maxHeight;
  }

  const x = Math.max(0, Math.min(band.x, caption.bbox.x) - 6);
  const right = Math.min(
    layout.pageWidth,
    Math.max(band.x + band.width, caption.bbox.x + caption.bbox.width) + 6
  );

  return {
    page: caption.pageStart,
    x,
    y,
    width: Math.max(24, right - x),
    height,
  };
}

export type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function rectOverlapArea(a: LayoutRect, b: LayoutRect): number {
  const width = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  );
  const height = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  );
  return width * height;
}

/**
 * Assign each rectangle to at most one region: the region with the largest
 * unpadded overlap. Side-by-side figures must not share an image just because
 * a crop band's padding touches the neighbor.
 */
export function assignRectsToRegions<T extends LayoutRect>(
  rects: T[],
  regions: { id: string; rect: LayoutRect }[]
): Map<string, T[]> {
  const assigned = new Map<string, T[]>();
  for (const region of regions) {
    if (!assigned.has(region.id)) assigned.set(region.id, []);
  }

  for (const rect of rects) {
    let bestId: string | null = null;
    let bestArea = 0;
    let bestCenterDist = Number.POSITIVE_INFINITY;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;

    for (const region of regions) {
      const area = rectOverlapArea(rect, region.rect);
      if (area <= 0) continue;
      const rx = region.rect.x + region.rect.width / 2;
      const ry = region.rect.y + region.rect.height / 2;
      const dist = (cx - rx) ** 2 + (cy - ry) ** 2;
      const closer = Math.abs(area - bestArea) <= 0.5 && dist < bestCenterDist;
      if (area > bestArea + 0.5 || closer) {
        bestArea = area;
        bestCenterDist = dist;
        bestId = region.id;
      }
    }

    if (bestId) assigned.get(bestId)?.push(rect);
  }

  return assigned;
}

export function reconstructDocument(pages: ExtractedPage[]): {
  layouts: PageColumnLayout[];
  lines: LayoutLine[];
  blocks: LayoutBlock[];
  baseFontSize: number;
} {
  const patterns = detectHeaderFooterPatterns(pages);
  const layouts = pages.map(detectPageColumns);
  const lines: LayoutLine[] = [];

  for (let i = 0; i < pages.length; i++) {
    lines.push(...buildPageLines(pages[i], layouts[i], patterns));
  }

  const bodyFont = median(
    lines
      .filter((l) => l.text.length > 40)
      .map((l) => l.fontSize)
  ) || 10;

  const blocks = groupLinesIntoBlocks(lines, bodyFont);
  return { layouts, lines, blocks, baseFontSize: bodyFont };
}

export function formatReadingOrderLog(
  blocks: LayoutBlock[],
  options: { pages?: number[] } = {}
): string {
  const wanted = options.pages ? new Set(options.pages) : null;
  const parts: string[] = [];
  let lastPage = -1;
  let lastColumn: LayoutColumn | null = null;

  for (const block of blocks) {
    if (wanted && !wanted.has(block.pageStart)) continue;
    if (block.role === "header" || block.role === "footer") continue;
    if (block.pageStart !== lastPage) {
      parts.push(`\n===== PAGE ${block.pageStart} =====`);
      lastPage = block.pageStart;
      lastColumn = null;
    }
    if (block.column !== lastColumn) {
      parts.push(`--- column: ${block.column} ---`);
      lastColumn = block.column;
    }
    parts.push(`[${block.role}] ${block.text}`);
  }
  return parts.join("\n");
}
