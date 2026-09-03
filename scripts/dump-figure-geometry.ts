import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
import { reconstructDocument, figureImageRect, figureLookupKey } from "../src/services/pdfLayout.ts";
import type { ExtractedPage, ExtractedTextItem } from "../src/services/pdfService.ts";

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error("Usage: npx tsx scripts/dump-figure-geometry.ts <pdf>");
  process.exit(1);
}

const data = new Uint8Array(fs.readFileSync(pdfPath));
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

const { blocks, layouts } = reconstructDocument(pages);

function overlapsX(
  a: { x: number; width: number },
  b: { x: number; width: number }
) {
  return a.x < b.x + b.width && b.x < a.x + a.width;
}

for (const cap of blocks.filter((b) => b.role === "figure_caption")) {
  const page = cap.pageStart;
  const layout = layouts[page - 1];
  const same = blocks.filter((b) => b.pageStart === page && b !== cap);
  const above = same.filter(
    (b) =>
      b.bbox.y + b.bbox.height <= cap.bbox.y + 4 && overlapsX(b.bbox, cap.bbox)
  );
  above.sort(
    (a, b) => a.bbox.y + a.bbox.height > b.bbox.y + b.bbox.height ? -1 : 1
  );
  const nearest = above[0];
  const substantial = above.find(
    (b) =>
      b.role === "heading" || (b.role === "paragraph" && b.text.length > 50)
  );
  const gapNearest = nearest
    ? cap.bbox.y - (nearest.bbox.y + nearest.bbox.height)
    : cap.bbox.y;
  const gapSub = substantial
    ? cap.bbox.y - (substantial.bbox.y + substantial.bbox.height)
    : null;
  console.log(`\n${cap.text.slice(0, 80)}`);
  console.log(
    `  page=${page} col=${cap.column} caption y=${cap.bbox.y.toFixed(1)} h=${cap.bbox.height.toFixed(1)} x=${cap.bbox.x.toFixed(1)} w=${cap.bbox.width.toFixed(1)}`
  );
  console.log(
    `  gutter=${layout.gutterX.toFixed(1)} page=${layout.pageWidth.toFixed(1)}x${layout.pageHeight.toFixed(1)}`
  );
  console.log(
    `  nearest [${nearest?.role}] "${(nearest?.text || "").slice(0, 70)}" gap=${gapNearest.toFixed(1)}`
  );
  const crop = figureImageRect(cap, blocks, layout);
  console.log(
    `  crop ${crop ? `${crop.width.toFixed(0)}x${crop.height.toFixed(0)} @ (${crop.x.toFixed(0)},${crop.y.toFixed(0)}) key=${figureLookupKey(cap.text, page)}` : "NONE"}`
  );
}

for (const pageNum of [2, 3, 4, 5, 6]) {
  const page = await pdf.getPage(pageNum);
  const opList = await page.getOperatorList();
  let images = 0;
  let forms = 0;
  for (const fn of opList.fnArray) {
    if (
      fn === OPS.paintImageXObject ||
      fn === OPS.paintInlineImageXObject ||
      fn === OPS.paintImageXObjectRepeat
    ) {
      images++;
    }
    if (fn === OPS.paintFormXObjectBegin) forms++;
  }
  console.log(
    `\npage ${pageNum} paintImage=${images} formXObject=${forms} ops=${opList.fnArray.length}`
  );
}
