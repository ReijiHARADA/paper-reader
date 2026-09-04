import type { BoundingBox } from "../../types/paper";

export type EvidenceSource =
  | "pdf-native"
  | "generic-heuristic"
  | "format-profile"
  | "grobid"
  | "layout-model"
  | "ocr";

export type ExtractionEvidence = {
  source: EvidenceSource;
  label: string;
  confidence: number;
  nodeId?: string;
  page?: number;
  bbox?: BoundingBox;
  reason?: string;
};

/** @deprecated Use ExtractionEvidence. Kept for PoC call sites. */
export type Evidence = ExtractionEvidence & { note?: string };

export type FormatId = "generic" | "acm" | "ieee" | "springer-lncs" | "jstage";

export type PageTextKind = "native-text" | "scanned" | "garbled" | "mixed";

export type DocumentEvidence = {
  metadataTitle?: string;
  metadataAuthor?: string;
  pageCount: number;
  firstPageTwoColumn: boolean;
  columnPageRatio: number;
  bodyFontSize: number;
  pageWidth: number;
  pageHeight: number;
  firstPagesText: string;
  fullTextSample: string;
  titleCandidates: string[];
  authorCandidates: string[];
  affiliationCandidates: string[];
  headingCandidates: string[];
  captionCandidates: string[];
  doiHints: string[];
};

export type FormatDetection = {
  applied: FormatId;
  scores: Record<FormatId, number>;
  reason: string;
};

export type TitleFusion = {
  text: string;
  confidence: number;
  evidence: ExtractionEvidence[];
};

export type AuthorAffiliationLink = {
  author: string;
  affiliation: string;
};

export type GrobidHeader = {
  title: string | null;
  authors: string[];
  affiliations: string[];
  links: AuthorAffiliationLink[];
  abstract: string | null;
};
