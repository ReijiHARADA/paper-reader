import type { BoundingBox } from "../../types/paper";

export type StructureRelationType =
  | "READS_BEFORE"
  | "CHILD_OF"
  | "CAPTION_OF"
  | "CITES"
  | "CONTINUES"
  | "ALIGNED_WITH"
  | "AUTHOR_AFFILIATED_WITH";

export type StructureEvidence = {
  source: string;
  confidence: number;
};

export type StructureLine = {
  text: string;
  bbox: BoundingBox;
  baseline: number;
  fontSize: number;
};

export type StructureBlock = {
  type: string;
  pageStart: number;
  pageEnd: number;
  boundingBoxes: BoundingBox[];
  column?: string;
  extractionConfidence: number | null;
  evidence?: StructureEvidence[];
  lines?: StructureLine[];
  sectionId?: string | null;
  parentBlockId?: string | null;
  translationStatus?: string;
  metadata?: Record<string, unknown>;
  referenceId?: string;
};

export type StructureRelation = {
  type: StructureRelationType;
  from: string;
  to: string;
  score?: number;
};

export type StructureReference = {
  id: string;
  blockId: string;
  number: string;
  title?: string;
  authors?: string[];
  year?: number | null;
  doi?: string | null;
  url?: string | null;
  arxivId?: string | null;
  rawText: string;
};

export type StructureFile = {
  schemaVersion: number;
  blocks: Record<string, StructureBlock>;
  relations: StructureRelation[];
  references?: Record<string, StructureReference>;
  sections?: Array<{
    id: string;
    parentSectionId: string | null;
    order: number;
    level: number;
    originalTitle: string;
    translatedTitle: string | null;
    normalizedKind: string;
  }>;
};
