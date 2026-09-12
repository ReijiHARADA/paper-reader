/**
 * Verify that every physical-source warning produced during canonical
 * projection is withheld from MADLAD. This is extraction-only: it works
 * without a translation server and never mutates cached papers or reports.
 *
 * Usage: npx tsx scripts/verify-real-paper-source-policy.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";
import {
  shouldTranslateParagraph,
  isExpectedNonProseParagraph,
  unsafeParagraphStructureReason,
} from "../src/services/translation/quality.ts";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")
) as { pdfDir: string; papers: Array<{ id: string; title: string; filename: string }> };

type Violation = {
  paper: string;
  blockId: string;
  translationStatus: string;
  wouldSubmitToModel: boolean;
  storedWarning: unknown;
  expectedWarning: string;
  source: string;
};

async function main(): Promise<void> {
  const violations: Violation[] = [];
  let cachedPapers = 0;
  let paragraphs = 0;
  let warned = 0;

  for (const paper of catalog.papers) {
    const pdfPath = path.join(root, catalog.pdfDir, paper.filename);
    if (!fs.existsSync(pdfPath)) continue;
    cachedPapers += 1;
    const pages = await extractPdfPages(pdfPath);
    const saved = [console.log, console.info, console.warn];
    console.log = console.info = console.warn = () => {};
    let extracted: ReturnType<typeof extractFromPages>;
    try {
      extracted = extractFromPages({
        pages,
        paperId: `source-policy-${paper.id}`,
        filePath: paper.filename,
        fileHash: paper.id,
        metadata: { title: paper.title, pageCount: pages.length },
      });
    } finally {
      [console.log, console.info, console.warn] = saved as typeof saved;
    }

    for (const block of extracted.blocks) {
      if (block.type !== "paragraph" || !block.original) continue;
      paragraphs += 1;
      const expectedWarning = unsafeParagraphStructureReason(block.original);
      if (!expectedWarning || isExpectedNonProseParagraph(block.original)) continue;
      warned += 1;
      const storedWarning = block.metadata.translationInputWarning;
      const wouldSubmitToModel = shouldTranslateParagraph(block.original);
      if (
        wouldSubmitToModel ||
        block.translationStatus !== "skipped" ||
        storedWarning !== expectedWarning
      ) {
        violations.push({
          paper: paper.id,
          blockId: block.id,
          translationStatus: block.translationStatus,
          wouldSubmitToModel,
          storedWarning,
          expectedWarning,
          source: block.original.replace(/\s+/g, " ").slice(0, 180),
        });
      }
    }
  }

  console.log(
    JSON.stringify(
      { cachedPapers, paragraphs, warningTaggedBlocks: warned, violations },
      null,
      2
    )
  );
  if (violations.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
