import type { ExtractedPage } from "../../pdfService";
import { ocrDocument } from "../../ocrService";
import { classifyPage, pageClassSignals, scannedByItemAverage } from "../pageClass";
import type { ExtractionEnricher } from "./types";
import type { ExtractionEvidence } from "../types";

export function pagesNeedingOcr(pages: ExtractedPage[]): Set<number> {
  const needed = new Set<number>();
  const baselineAll = scannedByItemAverage(pages);
  for (const page of pages) {
    const kind = classifyPage(pageClassSignals(page));
    if (baselineAll || kind === "scanned" || kind === "garbled") {
      needed.add(page.pageNumber);
    }
  }
  return needed;
}

export const visionOcrEnricher: ExtractionEnricher = {
  id: "vision-ocr",
  shouldRun(context) {
    return pagesNeedingOcr(context.pages).size > 0;
  },
  async extract(context) {
    const pages = [...pagesNeedingOcr(context.pages)];
    const evidence: ExtractionEvidence[] = pages.map((page) => ({
      source: "ocr" as const,
      label: "page",
      confidence: 0.55,
      page,
      reason: "scanned or garbled page; Vision OCR fallback",
    }));
    return evidence;
  },
};

export async function applyVisionOcr(
  pages: ExtractedPage[],
  pdfDoc: unknown,
  onProgress?: (page: number, total: number) => void
): Promise<{ pages: ExtractedPage[]; ocrPages: Set<number> }> {
  const needed = pagesNeedingOcr(pages);
  if (needed.size === 0) {
    return { pages, ocrPages: new Set() };
  }

  const ocrResults = await ocrDocument(pdfDoc, ["en-US", "ja-JP"], onProgress);
  const ocrPages = new Set<number>();
  for (const ocrPage of ocrResults) {
    if (!needed.has(ocrPage.pageNumber) || ocrPage.lines.length === 0) continue;
    const pdfPage = pages.find((p) => p.pageNumber === ocrPage.pageNumber);
    if (!pdfPage) continue;
    pdfPage.textItems = ocrPage.lines.map((line, idx) => ({
      text: line.text,
      x: 0,
      y: idx * 20,
      width: 500,
      height: 14,
      fontSize: 12,
      fontName: "ocr",
      page: ocrPage.pageNumber,
    }));
    ocrPages.add(ocrPage.pageNumber);
  }
  return { pages, ocrPages };
}
