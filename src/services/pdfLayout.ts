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
import { isReferencesHeading } from "./translation/quality";

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
  const isMultiColumn =
    leftItems.length >= MIN_COLUMN_ITEMS &&
    rightItems.length >= MIN_COLUMN_ITEMS &&
    rightX - leftX >= 80;

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
  page: number
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
  };
}

function clusterItemsIntoLines(
  items: ExtractedTextItem[],
  column: LayoutColumn,
  pageNumber: number
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
    .map((group) => itemsToLine(group, column, pageNumber))
    .filter((line) => line.text.length > 0)
    .sort((a, b) => a.y - b.y);
}

function isRepeatedHeaderFooter(text: string, patterns: Set<string>): boolean {
  return patterns.has(text.trim().toLowerCase());
}

function detectHeaderFooterPatterns(pages: ExtractedPage[]): Set<string> {
  const counts = new Map<string, number>();
  for (const page of pages) {
    const edge = page.textItems.filter(
      (i) => i.y < HEADER_Y || i.y > page.height - FOOTER_MARGIN
    );
    const seen = new Set<string>();
    for (const item of edge) {
      const key = item.text.trim().toLowerCase();
      if (key.length < 4 || key.length > 120) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const patterns = new Set<string>();
  const threshold = Math.max(2, Math.floor(pages.length * 0.3));
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
  if (line.y < HEADER_Y) return true;
  if (line.y > layout.pageHeight - FOOTER_MARGIN) return true;
  if (/^\d{1,3}$/.test(line.text.trim())) return true;
  if (isRepeatedHeaderFooter(line.text, patterns)) return true;
  if (
    /^(proceedings of|conference on|tei\s+\d{4}|chi\s+\d{4})/i.test(line.text)
  ) {
    return true;
  }
  return false;
}

function isFigureCaption(text: string): boolean {
  return /^(figure|fig\.?)\s*\d+/i.test(text.trim());
}

function isTableCaption(text: string): boolean {
  return /^table\s+\d+/i.test(text.trim());
}

function isCopyright(text: string, fontSize: number, baseFont: number): boolean {
  if (fontSize > baseFont * 0.92) return false;
  return /permission to make digital or hard copies/i.test(text);
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
];

function isHeadingLine(line: LayoutLine, baseFont: number): boolean {
  const text = line.text.trim();
  if (!text || text.length > 90) return false;
  if (isFigureCaption(text) || isTableCaption(text)) return false;
  if (/^\d+\.\s+[A-Z]/.test(text) && !/^\d+\.\d+/.test(text)) {
    // "6. Martin A. Conway..." is a bibliography item, not "6. Results"
    if (/\b(19|20)\d{2}\b/.test(text) || /\b[A-Z]\.\s+[A-Z]/.test(text)) {
      return false;
    }
    if (/\band\b/.test(text) && /[A-Z][a-z]+\s+[A-Z]/.test(text)) return false;
  }
  if (NAMED_HEADINGS.some((re) => re.test(text))) return true;
  if (/^\d+(\.\d+)+\.?\s+\S/.test(text) && text.length < 80) return true;
  if (/^\d+\.?\s+[A-Z][A-Za-z].{0,40}$/.test(text) && text.split(/\s+/).length <= 8) {
    if (!/,/.test(text) && !/\b(19|20)\d{2}\b/.test(text)) return true;
  }
  const letters = text.replace(/[^A-Za-z]/g, "");
  const upper = text.replace(/[^A-Z]/g, "");
  if (letters.length >= 6 && upper.length / letters.length > 0.72) return true;
  if (line.fontSize > baseFont * 1.18 && text.length < 80) return true;
  return false;
}

function looksLikeEmail(text: string): boolean {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
}

function looksLikeAffiliation(text: string): boolean {
  return /(university|department|institute|college|faculty|laboratory|research (center|centre)|school of)/i.test(
    text
  );
}

function looksLikePersonName(text: string): boolean {
  if (looksLikeEmail(text) || looksLikeAffiliation(text)) return false;
  if (text.length > 60 || text.length < 4) return false;
  if (/^\d/.test(text)) return false;
  const parts = text.split(/\s+/);
  if (parts.length < 2 || parts.length > 6) return false;
  return parts.every((p) => /^[A-Z][A-Za-z.'’-]*$/.test(p) || /^[A-Z]\.$/.test(p));
}

function joinLines(lines: LayoutLine[]): string {
  if (lines.length === 0) return "";
  let text = lines[0].text.trim();
  for (let i = 1; i < lines.length; i++) {
    const next = lines[i].text.trim();
    if (!next) continue;
    if (text.endsWith("-") && /^[a-z]/.test(next)) {
      text = text.slice(0, -1) + next;
    } else {
      text += " " + next;
    }
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
      ...clusterItemsIntoLines(buckets[column], column, page.pageNumber)
    );
  });

  const visible = lines.filter((line) => !isEdgeChrome(line, layout, patterns));
  const splitAt = visible.find((line) =>
    /^(abstract|introduction)$/i.test(line.text.trim())
  );
  if (layout.isMultiColumn && splitAt && page.pageNumber === 1) {
    const masthead = visible.filter((line) => line.y < splitAt.y);
    const body = visible.filter((line) => line.y >= splitAt.y);
    return [...orderPageLines(masthead, layout), ...orderPageLines(body, layout)];
  }

  return orderPageLines(visible, layout);
}

function detectMastheadEnd(lines: LayoutLine[]): number {
  const pageOne = lines.filter((l) => l.page === 1);
  if (pageOne.length === 0) return -1;
  const bodyStart = pageOne.find((l) =>
    /^(abstract|introduction|author keywords?)$/i.test(l.text.trim())
  );
  return bodyStart ? bodyStart.y : -1;
}

function roleForLine(
  line: LayoutLine,
  baseFont: number,
  mastheadEndY: number,
  inCopyright: boolean
): LayoutRole {
  const text = line.text.trim();
  if (isCopyright(text, line.fontSize, baseFont) || inCopyright) {
    return "copyright";
  }
  if (isFigureCaption(text)) return "figure_caption";
  if (isTableCaption(text)) return "table_caption";

  const inMasthead =
    line.page === 1 && (mastheadEndY < 0 || line.y < mastheadEndY);
  if (inMasthead) {
    if (line.fontSize > baseFont * 1.35 && text.length > 8) return "title";
    if (looksLikeEmail(text)) return "author";
    if (looksLikePersonName(text)) return "author";
    if (looksLikeAffiliation(text)) return "affiliation";
    return line.fontSize > baseFont * 1.05 ? "author" : "affiliation";
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
  const mastheadEndY = detectMastheadEnd(lines);
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
    const role = roleForLine(line, baseFont, mastheadEndY, copyrightStarted);
    if (isReferencesHeading(line.text)) {
      inReferences = true;
    }
    const forcedRole =
      inReferences &&
      role === "heading" &&
      !isReferencesHeading(line.text)
        ? "paragraph"
        : role;
    const atomic =
      forcedRole === "heading" ||
      forcedRole === "title" ||
      forcedRole === "figure_caption" ||
      forcedRole === "table_caption";

    if (currentRole === null) {
      current = [line];
      currentRole = forcedRole;
      if (atomic && forcedRole !== "figure_caption" && forcedRole !== "table_caption") {
        flush();
      }
      continue;
    }

    const sameRole = forcedRole === currentRole;
    const mergeable =
      sameRole &&
      !atomic &&
      currentRole !== "heading" &&
      currentRole !== "title" &&
      canMerge(current[current.length - 1], line, baseFont);

    const captionContinue =
      (currentRole === "figure_caption" || currentRole === "table_caption") &&
      line.page === current[0].page &&
      line.column === current[0].column &&
      line.y - current[current.length - 1].y < baseFont * 2.4 &&
      line.fontSize <= current[0].fontSize + 0.6 &&
      !isHeadingLine(line, baseFont);

    if (mergeable || captionContinue) {
      current.push(line);
      continue;
    }

    flush();
    current = [line];
    currentRole = forcedRole;
    if (atomic && forcedRole !== "figure_caption" && forcedRole !== "table_caption") {
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
      const glue =
        target.text.endsWith("-") && /^[a-z]/.test(block.text.trim())
          ? ""
          : " ";
      const left = target.text.endsWith("-")
        ? target.text.slice(0, -1)
        : target.text;
      target.text = (left + glue + block.text).replace(/\s+/g, " ").trim();
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
  const match = text.trim().match(/^(?:figure|fig\.?)\s*(\d+)/i);
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
