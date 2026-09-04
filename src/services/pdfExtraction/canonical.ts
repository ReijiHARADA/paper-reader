import type { BoundingBox } from "../../types/paper";
import type { Evidence, FormatId } from "./types";

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

export type CanonicalNode = {
  id: string;
  role: CanonicalRole;
  text: string;
  page: number;
  bbox?: BoundingBox;
  evidence: Evidence[];
};

export type CanonicalRelationKind = "READS_BEFORE" | "CAPTION_OF" | "AFFILIATED_WITH" | "CHILD_OF";

export type CanonicalRelation = {
  kind: CanonicalRelationKind;
  from: string;
  to: string;
  score: number;
};

export type CanonicalDocument = {
  formatApplied: FormatId;
  nodes: CanonicalNode[];
  relations: CanonicalRelation[];
};
