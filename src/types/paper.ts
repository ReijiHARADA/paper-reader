export type BoundingBox = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TranslationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "skipped";

export type BlockType =
  | "heading"
  | "paragraph"
  | "figure"
  | "table"
  | "equation"
  | "footnote"
  | "reference";

export type PaperBlock = {
  id: string;
  paperId: string;
  sectionId: string | null;
  type: BlockType;
  order: number;
  pageStart: number;
  pageEnd: number;
  boundingBoxes: BoundingBox[];
  original: string | null;
  translated: string | null;
  extractionConfidence: number | null;
  translationStatus: TranslationStatus;
  parentBlockId: string | null;
  metadata: Record<string, unknown>;
};

export type NormalizedSectionKind =
  | "abstract"
  | "introduction"
  | "related_work"
  | "method"
  | "results"
  | "discussion"
  | "conclusion"
  | "references"
  | "other";

export type Section = {
  id: string;
  paperId: string;
  parentSectionId: string | null;
  order: number;
  level: number;
  originalTitle: string;
  translatedTitle: string | null;
  normalizedKind: NormalizedSectionKind;
};

export type ProcessingStatus =
  | "queued"
  | "extracting"
  | "structuring"
  | "glossary"
  | "translating"
  | "ready"
  | "partial"
  | "failed";

export type Paper = {
  id: string;
  sourceFilePath: string;
  sourceFileHash: string;
  titleOriginal: string | null;
  titleTranslated: string | null;
  authors: string[];
  publication: string | null;
  year: number | null;
  pageCount: number;
  processingStatus: ProcessingStatus;
  lastReadBlockId: string | null;
  lastReadOffset: number | null;
  favorite?: boolean;
  lastOpenedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type FigureMetadata = {
  imageUrl: string;
  captionOriginal: string;
  captionTranslated: string | null;
  figureNumber: string;
};

export type TableMetadata = {
  imageUrl?: string;
  tableNumber: string;
  captionOriginal: string;
  captionTranslated: string | null;
};

export type EquationMetadata = {
  latex?: string;
  imageUrl?: string;
  equationNumber?: string;
};
