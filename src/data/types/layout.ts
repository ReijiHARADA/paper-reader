import type { BoundingBox } from "../../types/paper";

export type LayoutSpan = {
  text: string;
  bbox: BoundingBox;
  font?: string;
  fontSize: number;
  style?: string;
  lineIndex: number;
  blockId?: string;
};

export type LayoutPageProvenance = {
  page: number;
  width?: number;
  height?: number;
  spans: LayoutSpan[];
};

export type LayoutFile = {
  schemaVersion: number;
  pages: LayoutPageProvenance[];
};
