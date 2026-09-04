import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { extractPdfPages } from "./readingOrder/extractPdf";

const require = createRequire(import.meta.url);
const cmapDir = path.join(
  path.dirname(require.resolve("pdfjs-dist/package.json")),
  "cmaps"
);

describe("pdf.js CMaps", () => {
  it("includes Adobe-Japan1 CMap for CID Japanese fonts", () => {
    expect(fs.existsSync(path.join(cmapDir, "Adobe-Japan1-UCS2.bcmap"))).toBe(
      true
    );
  });

  it("decodes Japanese body text from a CID-font PDF when provided", async () => {
    const pdfPath = process.env.PAPER_READER_JA_PDF;
    if (!pdfPath || !fs.existsSync(pdfPath)) return;
    const pages = await extractPdfPages(pdfPath);
    const text = pages
      .flatMap((page) => page.textItems.map((item) => item.text))
      .join("");
    expect(text).toMatch(/[\u3040-\u30ff\u4e00-\u9fff]{20,}/);
  });
});
