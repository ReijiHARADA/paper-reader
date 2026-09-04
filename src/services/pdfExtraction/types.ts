/**
 * Extraction research types. Not wired into importServiceV2.
 */

export type EvidenceSource =
  | "pdf-native"
  | "generic-heuristic"
  | "format-profile"
  | "grobid"
  | "layout-model"
  | "ocr";

export type Evidence = {
  source: EvidenceSource;
  label: string;
  confidence: number;
  note?: string;
};

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
  /** Concatenated layout text for the first two pages (native pdf.js strings). */
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
  evidence: Evidence[];
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
