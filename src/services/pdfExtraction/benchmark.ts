import type { LayoutBlock } from "../pdfLayout";
import type { ExtractedPage } from "../pdfService";
import { evidenceFromPages } from "./evidence";
import { detectFormat } from "./formats";
import { fuseTitle } from "./fusion";
import { parseGrobidHeaderTei } from "./grobid/tei";
import {
  pairwiseOrderAccuracy,
  setScores,
  substringRecall,
  titleExactMatch,
} from "./metrics";
import { classifyDocument, scannedByItemAverage } from "./pageClass";
import type { FormatId } from "./types";

export type PartialGroundTruth = {
  id: string;
  title?: string;
  authors?: string[];
  affiliations?: string[];
  headings?: string[];
  tokensInOrder?: [string, string];
  figureCaptions?: string[];
  tableCaptions?: string[];
  pageCount?: number;
};

export type BaselinePaperReport = {
  id: string;
  filename: string;
  formatApplied: FormatId;
  formatScores: Record<FormatId, number>;
  formatReason: string;
  catalogFormatFamily?: string;
  pageKind: ReturnType<typeof classifyDocument>;
  scannedByItemAverage: boolean;
  titlePredicted: string | null;
  titleExact?: boolean;
  authorF1?: number;
  affiliationF1?: number;
  headingRecall?: number;
  readingOrderPair?: number;
  figureCaptionRecall?: number;
  tableCaptionRecall?: number;
  fusedTitle: string;
  fusedTitleConfidence: number;
};

export function evaluateBaselinePaper(input: {
  id: string;
  filename: string;
  pages: ExtractedPage[];
  blocks: LayoutBlock[];
  catalogFormatFamily?: string;
  catalogTitle?: string;
  grobidTei?: string;
  groundTruth?: PartialGroundTruth;
}): BaselinePaperReport {
  const evidence = evidenceFromPages(input.pages);
  const detection = detectFormat(evidence);
  const grobid = input.grobidTei ? parseGrobidHeaderTei(input.grobidTei) : null;
  const fused = fuseTitle(
    evidence.titleCandidates,
    detection.applied === "generic"
      ? []
      : [
          {
            source: "format-profile",
            label: `${detection.applied}-title-region`,
            confidence: detection.scores[detection.applied],
          },
        ],
    grobid?.title
  );

  const titles = input.blocks.filter((b) => b.role === "title").map((b) => b.text);
  const authors = input.blocks.filter((b) => b.role === "author").map((b) => b.text);
  const affiliations = input.blocks
    .filter((b) => b.role === "affiliation")
    .map((b) => b.text);
  const headings = input.blocks.filter((b) => b.role === "heading").map((b) => b.text);
  const figures = input.blocks
    .filter((b) => b.role === "figure_caption")
    .map((b) => b.text);
  const tables = input.blocks
    .filter((b) => b.role === "table_caption")
    .map((b) => b.text);
  const sequence = input.blocks.map((b) => b.text);
  const gold = input.groundTruth;
  const expectedTitle = gold?.title ?? input.catalogTitle;

  return {
    id: input.id,
    filename: input.filename,
    formatApplied: detection.applied,
    formatScores: detection.scores,
    formatReason: detection.reason,
    catalogFormatFamily: input.catalogFormatFamily,
    pageKind: classifyDocument(input.pages),
    scannedByItemAverage: scannedByItemAverage(input.pages),
    titlePredicted: titles[0] ?? null,
    titleExact: expectedTitle
      ? titleExactMatch(titles.join(" "), expectedTitle)
      : undefined,
    authorF1:
      gold?.authors && gold.authors.length > 0
        ? setScores(authors, gold.authors).f1
        : undefined,
    affiliationF1:
      gold?.affiliations && gold.affiliations.length > 0
        ? setScores(affiliations, gold.affiliations).f1
        : undefined,
    headingRecall: gold?.headings
      ? substringRecall(headings, gold.headings)
      : undefined,
    readingOrderPair: gold?.tokensInOrder
      ? pairwiseOrderAccuracy(sequence, [gold.tokensInOrder])
      : undefined,
    figureCaptionRecall: gold?.figureCaptions
      ? substringRecall(figures, gold.figureCaptions)
      : undefined,
    tableCaptionRecall: gold?.tableCaptions
      ? substringRecall(tables, gold.tableCaptions)
      : undefined,
    fusedTitle: fused.text,
    fusedTitleConfidence: fused.confidence,
  };
}
