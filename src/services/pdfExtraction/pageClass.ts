import type { ExtractedPage } from "../pdfService";
import { isScannedPdf } from "../ocrService";
import type { PageTextKind } from "./types";

export type PageClassSignals = {
  itemCount: number;
  charCount: number;
  replacementCount: number;
  spacedLetterHits: number;
  imageHint: boolean;
};

export function pageClassSignals(page: ExtractedPage): PageClassSignals {
  const items = page.textItems;
  const text = items.map((item) => item.text).join("");
  return {
    itemCount: items.length,
    charCount: text.replace(/\s+/g, "").length,
    replacementCount: (text.match(/\uFFFD/g) ?? []).length,
    spacedLetterHits: (text.match(/\b[A-Za-z]\s+[A-Za-z]\s+[A-Za-z]/g) ?? [])
      .length,
    imageHint: false,
  };
}

export function classifyPage(signals: PageClassSignals): PageTextKind {
  if (signals.itemCount < 10 && signals.charCount < 40) return "scanned";
  const replacementRate =
    signals.charCount === 0 ? 1 : signals.replacementCount / signals.charCount;
  if (replacementRate >= 0.04 || signals.spacedLetterHits >= 3) return "garbled";
  if (signals.itemCount < 10) return "scanned";
  return "native-text";
}

export function classifyDocument(pages: ExtractedPage[]): PageTextKind {
  const kinds = pages.map((page) => classifyPage(pageClassSignals(page)));
  const unique = new Set(kinds);
  if (unique.size > 1) return "mixed";
  return kinds[0] ?? "scanned";
}

/** Baseline from ocrService, kept for import compatibility. */
export function scannedByItemAverage(
  pages: ExtractedPage[]
): boolean {
  const items = pages.reduce((sum, page) => sum + page.textItems.length, 0);
  return isScannedPdf(items, Math.max(pages.length, 1));
}
