import type { BoundingBox } from "../../../types/paper";

export type NativeTextSource = "pdf-native" | "ocr";

export type NativePdfMetadata = {
  title?: string;
  author?: string;
  pageCount: number;
};

export type NativeTextItem = {
  id: string;
  text: string;
  bbox: BoundingBox;
  fontName?: string;
  fontSize: number;
  source: NativeTextSource;
};

export type NativeImage = {
  id: string;
  bbox: BoundingBox;
};

export type NativePage = {
  pageNumber: number;
  width: number;
  height: number;
  textItems: NativeTextItem[];
  images: NativeImage[];
  kind?: "native-text" | "scanned" | "garbled" | "mixed";
};

export type NativeDocument = {
  pageCount: number;
  metadata: NativePdfMetadata;
  pages: NativePage[];
};
