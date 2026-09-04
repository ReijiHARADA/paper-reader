import type { ExtractedPage } from "../pdfService";
import { reconstructDocument, type LayoutBlock } from "../pdfLayout";
import type { DocumentEvidence } from "./types";

const DOI_RE = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi;

export function extractDoiHints(text: string): string[] {
  const found = text.match(DOI_RE) ?? [];
  return [...new Set(found.map((doi) => doi.replace(/[.,;]+$/, "")))];
}

function textsOf(blocks: LayoutBlock[], role: LayoutBlock["role"]): string[] {
  return blocks.filter((b) => b.role === role).map((b) => b.text.trim()).filter(Boolean);
}

/**
 * Build detector evidence from the current pdf.js + pdfLayout baseline.
 * Catalog metadata must not be passed in; that is benchmark-only.
 */
export function evidenceFromPages(
  pages: ExtractedPage[],
  options: { metadataTitle?: string; metadataAuthor?: string } = {}
): DocumentEvidence {
  const { layouts, blocks, baseFontSize } = reconstructDocument(pages);
  const firstTwo = pages.filter((p) => p.pageNumber <= 2);
  const firstPagesText = firstTwo
    .flatMap((p) => p.textItems.map((item) => item.text))
    .join("\n");
  const fullTextSample = pages
    .slice(0, 4)
    .flatMap((p) => p.textItems.map((item) => item.text))
    .join("\n")
    .slice(0, 20_000);
  const page1 = layouts[0];
  const columnPages = layouts.filter((l) => l.isMultiColumn).length;

  return {
    metadataTitle: options.metadataTitle,
    metadataAuthor: options.metadataAuthor,
    pageCount: pages.length,
    firstPageTwoColumn: page1?.isMultiColumn ?? false,
    columnPageRatio: layouts.length === 0 ? 0 : columnPages / layouts.length,
    bodyFontSize: baseFontSize,
    pageWidth: page1?.pageWidth ?? pages[0]?.width ?? 0,
    pageHeight: page1?.pageHeight ?? pages[0]?.height ?? 0,
    firstPagesText,
    fullTextSample,
    titleCandidates: textsOf(blocks, "title"),
    authorCandidates: textsOf(blocks, "author"),
    affiliationCandidates: textsOf(blocks, "affiliation"),
    headingCandidates: textsOf(blocks, "heading"),
    captionCandidates: [
      ...textsOf(blocks, "figure_caption"),
      ...textsOf(blocks, "table_caption"),
    ],
    doiHints: extractDoiHints(`${firstPagesText}\n${fullTextSample}`),
  };
}
