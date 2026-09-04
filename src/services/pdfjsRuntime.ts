// 3.x legacy build is untyped CJS; WKWebView 向けにこちらを使う
// @ts-expect-error no types for the minified legacy build
import * as pdfjsNs from "pdfjs-dist/legacy/build/pdf.min.js";
import workerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.js?url";

type PdfJs = typeof import("pdfjs-dist");

const pdfjsLib = ((pdfjsNs as { default?: PdfJs }).default ?? pdfjsNs) as PdfJs;

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export { pdfjsLib };

export function openPdfDocument(data: ArrayBuffer | Uint8Array) {
  const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data);
  return pdfjsLib.getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
  });
}
