import type { BoundingBox } from "../../../types/paper";
import type { ExtractionEvidence, FormatDetection, FormatId, PageTextKind } from "../types";

export type CanonicalRole =
  | "title"
  | "author"
  | "affiliation"
  | "abstract"
  | "heading"
  | "paragraph"
  | "figure"
  | "table"
  | "caption"
  | "equation"
  | "footnote"
  | "citation"
  | "reference"
  | "header"
  | "footer"
  | "copyright"
  | "page-number"
  | "other";

export type SourceAnchor = {
  page: number;
  boundingBoxes: BoundingBox[];
  normalizedTextHash?: string;
};

export type CanonicalNode = {
  id: string;
  role: CanonicalRole;
  text: string | null;
  pageStart: number;
  pageEnd: number;
  boundingBoxes: BoundingBox[];
  confidence: number;
  evidence: ExtractionEvidence[];
  sourceAnchor: SourceAnchor;
  column?: string;
};

export type CanonicalRelationKind =
  | "READS_BEFORE"
  | "CAPTION_OF"
  | "AFFILIATED_WITH"
  | "CHILD_OF"
  | "CONTINUES"
  | "CITES";

export type CanonicalRelation = {
  kind: CanonicalRelationKind;
  from: string;
  to: string;
  score: number;
};

export type CanonicalSourceInfo = {
  filePath?: string;
  fileHash?: string;
  pageCount: number;
};

export type CanonicalDiagnostics = {
  layoutConfidence: number;
  readingOrderConfidence: number;
  textIntegrityConfidence: number;
  semanticConfidence: number;
  formatConfidence: number;
  relationConfidence: number;
  columnConfidence: number;
  unicodeConfidence: number;
  paragraphConfidence: number;
};

export type CanonicalDocument = {
  source: CanonicalSourceInfo;
  pageCount: number;
  format: FormatDetection;
  pageKind: PageTextKind;
  nodes: CanonicalNode[];
  relations: CanonicalRelation[];
  diagnostics: CanonicalDiagnostics;
  formatId: FormatId;
};
