import type { LayoutBlock } from "../pdfLayout";
import type { ExtractedPage } from "../pdfService";
import { evidenceFromPages } from "./evidence";
import { detectFormat } from "./formats";
import { fuseTitle } from "./fusion";
import { parseGrobidHeaderTei } from "./grobid/tei";
import {
  pairwiseOrderAccuracy,
  relationAccuracy,
  setScores,
  substringRecall,
  titleExactMatch,
} from "./metrics";
import { classifyDocument, scannedByItemAverage } from "./pageClass";
import type { FormatId } from "./types";
import { extractFromPages } from "./pipeline/extractAcademicPdf";

export type PartialGroundTruth = {
  id: string;
  title?: string;
  authors?: string[];
  affiliations?: string[];
  headings?: string[];
  tokensInOrder?: [string, string];
  figureCaptions?: string[];
  tableCaptions?: string[];
  authorAffiliation?: Array<{ from: string; to: string }>;
  headingHierarchy?: Array<{ from: string; to: string }>;
  figureCaptionRelations?: Array<{ from: string; to: string }>;
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
    headingHierarchyAccuracy?: number;
    readingOrderPair?: number;
    figureCaptionRecall?: number;
    tableCaptionRecall?: number;
    figureCaptionRelation?: number;
    authorAffiliationF1?: number;
    fusedTitle: string;
    fusedTitleConfidence: number;
    canonicalTitle?: string | null;
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
  const gold = input.groundTruth;
  const expectedTitle = gold?.title ?? input.catalogTitle;
  const extracted = extractFromPages({
    pages: input.pages,
    paperId: `bench-${input.id}`,
    filePath: input.filename,
    fileHash: input.id,
    metadata: { title: input.catalogTitle, pageCount: input.pages.length },
  });
  const canonicalTitle =
    extracted.canonical.nodes.find((n) => n.role === "title")?.text ?? null;
  const captionRels = extracted.canonical.relations.filter((r) => r.kind === "CAPTION_OF");
  const affRels = extracted.canonical.relations.filter((r) => r.kind === "AFFILIATED_WITH");
  const childRels = extracted.canonical.relations.filter((r) => r.kind === "CHILD_OF");

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
      ? titleExactMatch(canonicalTitle ?? titles.join(" "), expectedTitle)
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
    headingHierarchyAccuracy: gold?.headingHierarchy
      ? relationAccuracy(
          childRels.map((r) => ({
            from: extracted.canonical.nodes.find((n) => n.id === r.from)?.text ?? "",
            to: extracted.canonical.nodes.find((n) => n.id === r.to)?.text ?? "",
          })),
          gold.headingHierarchy
        )
      : undefined,
    readingOrderPair: gold?.tokensInOrder
      ? pairwiseOrderAccuracy(extracted.blocks.map((b) => b.original ?? ""), [
          gold.tokensInOrder,
        ])
      : undefined,
    figureCaptionRecall: gold?.figureCaptions
      ? substringRecall(figures, gold.figureCaptions)
      : undefined,
    tableCaptionRecall: gold?.tableCaptions
      ? substringRecall(tables, gold.tableCaptions)
      : undefined,
    figureCaptionRelation:
      gold?.figureCaptionRelations && gold.figureCaptionRelations.length > 0
        ? relationAccuracy(
            captionRels.map((r) => ({ from: r.from, to: r.to })),
            gold.figureCaptionRelations
          )
        : captionRels.length > 0
          ? 1
          : undefined,
    authorAffiliationF1:
      gold?.authorAffiliation && gold.authorAffiliation.length > 0
        ? relationAccuracy(
            affRels.map((r) => ({
              from: extracted.canonical.nodes.find((n) => n.id === r.from)?.text ?? "",
              to: extracted.canonical.nodes.find((n) => n.id === r.to)?.text ?? "",
            })),
            gold.authorAffiliation
          )
        : undefined,
    fusedTitle: fused.text,
    fusedTitleConfidence: fused.confidence,
    canonicalTitle,
  };
}
