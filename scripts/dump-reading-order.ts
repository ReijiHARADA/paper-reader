/**
 * Dump reconstructed reading order for a PDF.
 *
 * Usage:
 *   npx tsx scripts/dump-reading-order.ts /path/to/paper.pdf [page]
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
import path from "node:path";
import { reconstructDocument, formatReadingOrderLog } from "../src/services/pdfLayout.ts";
import type { ExtractedPage, ExtractedTextItem } from "../src/services/pdfService.ts";

const pdfPath = process.argv[2];
const pageFilter = process.argv[3] ? Number(process.argv[3]) : undefined;

if (!pdfPath) {
  console.error("Usage: npx tsx scripts/dump-reading-order.ts <pdf> [page]");
  process.exit(1);
}

const data = new Uint8Array(fs.readFileSync(path.resolve(pdfPath)));
const pdf = await getDocument({ data, disableWorker: true }).promise;

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

const { layouts, blocks } = reconstructDocument(pages);
const pagesToShow = pageFilter ? [pageFilter] : undefined;

console.log(
  layouts
    .map(
      (l) =>
        `page ${l.page}: ${l.isMultiColumn ? "2-column" : "1-column"} gutter=${l.gutterX.toFixed(1)}`
    )
    .join("\n")
);
console.log(formatReadingOrderLog(blocks, { pages: pagesToShow }));

if (pageFilter) {
  const pageBlocks = blocks.filter((b) => b.pageStart === pageFilter);
  const body = pageBlocks.filter(
    (b) => b.role === "paragraph" || b.role === "heading" || b.role === "figure_caption"
  );
  const first = body[0]?.text ?? "";
  const joined = body.map((b) => b.text).join(" \n ");
  const leftIndex = joined.search(/second half of the 20/i);
  const rightIndex = joined.search(/In terms of renewing interaction/i);
  const mixedFirst =
    /kinetic jewellery/i.test(first) && /second half of the 20/i.test(first);
  console.log("\n===== CHECKS =====");
  console.log("first body block:", first.slice(0, 220));
  console.log("left-column starts first (expected true):", /second half of the 20/i.test(first) && !/kinetic jewellery/i.test(first));
  console.log("left/right interleaved in first block (expected false):", mixedFirst);
  console.log("left body appears before right body (expected true):", leftIndex >= 0 && rightIndex > leftIndex);
}
