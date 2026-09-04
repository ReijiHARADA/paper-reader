import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import type { ExtractedPage, ExtractedTextItem } from "../../services/pdfService";

const require = createRequire(import.meta.url);
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js") as typeof import("pdfjs-dist");

pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve(
  "pdfjs-dist/legacy/build/pdf.worker.js"
);

const cmapDir = path.join(
  path.dirname(require.resolve("pdfjs-dist/package.json")),
  "cmaps"
);
const cMapUrl = cmapDir.endsWith(path.sep) ? cmapDir : `${cmapDir}/`;

export async function extractPdfPages(pdfPath: string): Promise<ExtractedPage[]> {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await pdfjsLib.getDocument({
    data,
    disableWorker: true,
    cMapUrl,
    cMapPacked: true,
    useSystemFonts: true,
  }).promise;
  const pages: ExtractedPage[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const textItems: ExtractedTextItem[] = [];

    for (const item of textContent.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const tx = item.transform;
      const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
      textItems.push({
        text: item.str,
        x: tx[4],
        y: viewport.height - tx[5],
        width: item.width,
        height: item.height,
        fontSize,
        fontName: item.fontName,
        page: pageNum,
      });
    }

    pages.push({
      pageNumber: pageNum,
      width: viewport.width,
      height: viewport.height,
      textItems,
    });
  }

  return pages;
}
