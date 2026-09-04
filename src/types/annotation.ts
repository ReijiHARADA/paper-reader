export type AnnotationStatus = "active" | "orphaned";

export type Annotation = {
  id: string;
  paperId: string;
  projectId: string | null;
  blockId: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  prefixContext: string;
  suffixContext: string;
  translationTextHash: string;
  note: string;
  status: AnnotationStatus;
  createdAt: string;
  updatedAt: string;
};

export const ANNOTATION_CONTEXT_CHARS = 60;
