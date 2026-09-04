import { extractPDFContent, extractFigureImages } from "../../pdfService";
import { figureLookupKey, formatReadingOrderLog } from "../../pdfLayout";
import type { ExtractedPage } from "../../pdfService";
import type { Paper, Section, PaperBlock } from "../../../types/paper";
import type { LayoutBlock, PageColumnLayout } from "../../pdfLayout";
import { nativeDocumentFromExtracted } from "../native/fromExtracted";
import type { NativeDocument } from "../native/types";
import { classifyDocument } from "../pageClass";
import { generateGenericCandidates } from "../generic/candidates";
import { evidenceFromPages } from "../evidence";
import { detectFormat } from "../formats";
import { applyFormatHardRules } from "../formats/applyHardRules";
import { resolveCanonicalDocument } from "../resolver/documentResolver";
import { projectCanonicalToPaper } from "../projection/toPaper";
import { applyVisionOcr, visionOcrEnricher } from "../enrichers/ocr";
import { grobidEnricher } from "../enrichers/grobid";
import { doclingEnricher } from "../enrichers/docling";
import type { CanonicalDocument } from "../canonical/types";
import type { ExtractionEvidence, PageTextKind } from "../types";
import type { ExtractionContext, ExtractionEnricher } from "../enrichers/types";

export type ExtractProgress = {
  stage: "extracting" | "ocr" | "structuring" | "figures";
  done: number;
  total: number;
  message: string;
};

export type ExtractAcademicPdfInput = {
  paperId: string;
  filePath: string;
  fileHash: string;
  file?: File;
  pages?: ExtractedPage[];
  metadata?: { title?: string; author?: string; pageCount: number };
  extractFigures?: boolean;
  onProgress?: (progress: ExtractProgress) => void;
};

export type ExtractAcademicPdfResult = {
  native: NativeDocument;
  canonical: CanonicalDocument;
  paper: Paper;
  sections: Section[];
  blocks: PaperBlock[];
  layoutBlocks: LayoutBlock[];
  layouts: PageColumnLayout[];
  pageKind: PageTextKind;
};

const ENRICHERS: ExtractionEnricher[] = [
  visionOcrEnricher,
  grobidEnricher,
  doclingEnricher,
];

function overallConfidence(canonical: CanonicalDocument): number {
  const d = canonical.diagnostics;
  return (
    (d.layoutConfidence +
      d.readingOrderConfidence +
      d.textIntegrityConfidence +
      d.semanticConfidence) /
    4
  );
}

/**
 * Formal PDF extraction entry point. Callers receive CanonicalDocument
 * plus a Paper Reader projection. Internal parsers are not exposed.
 */
export async function extractAcademicPdf(
  input: ExtractAcademicPdfInput
): Promise<ExtractAcademicPdfResult> {
  let pages = input.pages;
  let metadata = input.metadata;
  const ocrPages = new Set<number>();

  if (!pages) {
    if (!input.file) {
      throw new Error("extractAcademicPdf requires file or pages");
    }
    input.onProgress?.({
      stage: "extracting",
      done: 0,
      total: 1,
      message: "テキストを抽出しています...",
    });
    const pdfResult = await extractPDFContent(input.file, (page, total) => {
      input.onProgress?.({
        stage: "extracting",
        done: page,
        total,
        message: `テキストを抽出しています... (${page}/${total}ページ)`,
      });
    });
    pages = pdfResult.pages;
    metadata = pdfResult.metadata;
  }

  metadata = metadata ?? { pageCount: pages.length };
  const pageKind = classifyDocument(pages);

  if (input.file && visionOcrEnricher.shouldRun({ native: nativeDocumentFromExtracted(pages, metadata), pages })) {
    try {
      const { openPdfDocument } = await import("../../pdfjsRuntime");
      const arrayBuffer = await input.file.arrayBuffer();
      const pdfDoc = await openPdfDocument(arrayBuffer).promise;
      const applied = await applyVisionOcr(pages, pdfDoc, (page, total) => {
        input.onProgress?.({
          stage: "ocr",
          done: page,
          total,
          message: `OCR処理中... (${page}/${total}ページ)`,
        });
      });
      pages = applied.pages;
      for (const page of applied.ocrPages) ocrPages.add(page);
    } catch (ocrErr) {
      console.warn("OCR failed, proceeding with native text:", ocrErr);
    }
  }

  const native = nativeDocumentFromExtracted(pages, metadata, ocrPages);
  const result = extractFromPages({
    pages,
    paperId: input.paperId,
    filePath: input.filePath,
    fileHash: input.fileHash,
    metadata,
    native,
    pageKind,
  });

  if (input.file && input.extractFigures !== false) {
    input.onProgress?.({
      stage: "figures",
      done: 0,
      total: 1,
      message: "図を抽出しています...",
    });
    try {
      const figureImages = await extractFigureImages(
        input.file,
        result.layoutBlocks,
        result.layouts,
        (done, total) => {
          input.onProgress?.({
            stage: "figures",
            done,
            total,
            message: `図を抽出しています... (${done}/${total})`,
          });
        }
      );
      for (const block of result.blocks) {
        if (block.type !== "figure" && block.type !== "table") continue;
        const caption = String(block.metadata.captionOriginal ?? "");
        const key =
          String(block.metadata.figureKey ?? "") ||
          figureLookupKey(caption, block.pageStart);
        const imageUrl = figureImages.get(key);
        if (imageUrl) {
          block.metadata = { ...block.metadata, imageUrl };
        }
      }
      console.info(`[figures] extracted ${figureImages.size} images`);
    } catch (error) {
      console.warn("[figures] extraction failed", error);
    }
  }

  if (overallConfidence(result.canonical) < 0.7) {
    const extra = await runOptionalEnrichers({
      native: result.native,
      pages,
      pdfBytes: input.file ? new Uint8Array(await input.file.arrayBuffer()) : undefined,
      canonical: result.canonical,
    });
    if (extra.length > 0) {
      result.canonical.nodes[0]?.evidence.push(...extra);
    }
  }

  return result;
}

export function extractFromPages(input: {
  pages: ExtractedPage[];
  paperId: string;
  filePath: string;
  fileHash: string;
  metadata: { title?: string; author?: string; pageCount: number };
  native?: NativeDocument;
  pageKind?: PageTextKind;
}): ExtractAcademicPdfResult {
  const pageKind = input.pageKind ?? classifyDocument(input.pages);
  const native =
    input.native ??
    nativeDocumentFromExtracted(input.pages, input.metadata);
  const generic = generateGenericCandidates(input.pages);
  const detectorEvidence = evidenceFromPages(input.pages, {
    metadataTitle: input.metadata.title,
    metadataAuthor: input.metadata.author,
  });
  const detection = detectFormat(detectorEvidence);
  const applied = applyFormatHardRules(generic.candidates, detection);

  const canonical = resolveCanonicalDocument({
    candidates: applied.candidates,
    layouts: generic.layouts,
    blocks: generic.blocks,
    baseFontSize: generic.baseFontSize,
    detection,
    pageKind,
    pageCount: input.pages.length,
    filePath: input.filePath,
    fileHash: input.fileHash,
    metadataTitle: input.metadata.title,
    extraEvidence: applied.evidence,
  });

  console.info(
    "[reading-order] reconstructed paragraphs\n" +
      formatReadingOrderLog(generic.blocks)
  );

  const projected = projectCanonicalToPaper({
    canonical,
    paperId: input.paperId,
    filePath: input.filePath,
    fileHash: input.fileHash,
    metadata: input.metadata,
    layoutBlocks: generic.blocks,
    layouts: generic.layouts,
    baseFontSize: generic.baseFontSize,
  });

  return {
    native,
    canonical,
    paper: projected.paper,
    sections: projected.sections,
    blocks: projected.blocks,
    layoutBlocks: generic.blocks,
    layouts: generic.layouts,
    pageKind,
  };
}

async function runOptionalEnrichers(
  context: ExtractionContext
): Promise<ExtractionEvidence[]> {
  const collected: ExtractionEvidence[] = [];
  for (const enricher of ENRICHERS) {
    if (enricher.id === "vision-ocr") continue;
    if (!enricher.shouldRun(context)) continue;
    collected.push(...(await enricher.extract(context)));
  }
  return collected;
}
