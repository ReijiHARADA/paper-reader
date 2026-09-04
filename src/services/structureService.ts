import { formatReadingOrderLog, type LayoutBlock, type PageColumnLayout } from "./pdfLayout";
import type { ExtractedPage } from "./pdfService";
import type { Paper, Section, PaperBlock } from "../types/paper";
import { extractFromPages } from "./pdfExtraction/pipeline/extractAcademicPdf";

export type StructureResult = {
  paper: Paper;
  sections: Section[];
  blocks: PaperBlock[];
  layoutBlocks: LayoutBlock[];
  layouts: PageColumnLayout[];
};

/**
 * Compatibility wrapper. Production import uses extractAcademicPdf.
 */
export function analyzeStructure(
  pages: ExtractedPage[],
  paperId: string,
  filePath: string,
  fileHash: string,
  pdfMetadata: { title?: string; author?: string; pageCount: number }
): StructureResult {
  const result = extractFromPages({
    pages,
    paperId,
    filePath,
    fileHash,
    metadata: pdfMetadata,
  });
  return {
    paper: result.paper,
    sections: result.sections,
    blocks: result.blocks,
    layoutBlocks: result.layoutBlocks,
    layouts: result.layouts,
  };
}

export { formatReadingOrderLog };
