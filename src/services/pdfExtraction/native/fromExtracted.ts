import type { ExtractedPage } from "../../pdfService";
import type { NativeDocument, NativePdfMetadata } from "./types";

export function nativeDocumentFromExtracted(
  pages: ExtractedPage[],
  metadata: NativePdfMetadata,
  ocrPages: Set<number> = new Set()
): NativeDocument {
  return {
    pageCount: pages.length,
    metadata: {
      ...metadata,
      pageCount: metadata.pageCount || pages.length,
    },
    pages: pages.map((page) => ({
      pageNumber: page.pageNumber,
      width: page.width,
      height: page.height,
      images: [],
      textItems: page.textItems.map((item, index) => ({
        id: `t-${page.pageNumber}-${index}`,
        text: item.text,
        bbox: {
          page: page.pageNumber,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        },
        fontName: item.fontName,
        fontSize: item.fontSize,
        source: ocrPages.has(page.pageNumber) ? "ocr" : "pdf-native",
      })),
    })),
  };
}
