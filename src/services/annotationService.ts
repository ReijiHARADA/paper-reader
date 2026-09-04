import { v4 as uuidv4 } from "uuid";
import type { Annotation } from "../types/annotation";
import type { PaperBlock } from "../types/paper";
import {
  computeTextHash,
  deleteAnnotation as deleteAnnotationRow,
  getAnnotationsByPaper,
  saveAnnotation,
} from "./database";
import { captureContext, reanchorAnnotation } from "./annotationAnchor";

export type CreateAnnotationInput = {
  paperId: string;
  projectId: string | null;
  blockId: string;
  translated: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  note?: string;
};

export async function createAnnotation(
  input: CreateAnnotationInput
): Promise<Annotation> {
  const { prefixContext, suffixContext } = captureContext(
    input.translated,
    input.startOffset,
    input.endOffset
  );
  const now = new Date().toISOString();
  const annotation: Annotation = {
    id: uuidv4(),
    paperId: input.paperId,
    projectId: input.projectId,
    blockId: input.blockId,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    selectedText: input.selectedText,
    prefixContext,
    suffixContext,
    translationTextHash: await computeTextHash(input.translated),
    note: input.note ?? "",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  await saveAnnotation(annotation);
  return annotation;
}

export async function updateAnnotationNote(
  annotation: Annotation,
  note: string
): Promise<Annotation> {
  const updated: Annotation = {
    ...annotation,
    note,
    updatedAt: new Date().toISOString(),
  };
  await saveAnnotation(updated);
  return updated;
}

export async function deleteAnnotation(id: string): Promise<void> {
  await deleteAnnotationRow(id);
}

export async function listAnnotationsForPaper(
  paperId: string,
  blocks: PaperBlock[]
): Promise<Annotation[]> {
  const existing = await getAnnotationsByPaper(paperId);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const next: Annotation[] = [];

  for (const annotation of existing) {
    const block = byId.get(annotation.blockId);
    const translated = block?.translated ?? null;
    const hash = translated ? await computeTextHash(translated) : "";
    const anchored = reanchorAnnotation(annotation, translated, hash);
    if (
      anchored.status !== annotation.status ||
      anchored.startOffset !== annotation.startOffset ||
      anchored.endOffset !== annotation.endOffset ||
      anchored.translationTextHash !== annotation.translationTextHash
    ) {
      await saveAnnotation(anchored);
    }
    next.push(anchored);
  }

  return sortAnnotations(next, blocks);
}

export function sortAnnotations(
  annotations: Annotation[],
  blocks: PaperBlock[]
): Annotation[] {
  const order = new Map(blocks.map((b) => [b.id, b.order]));
  return [...annotations].sort((a, b) => {
    const oa = order.get(a.blockId) ?? Number.MAX_SAFE_INTEGER;
    const ob = order.get(b.blockId) ?? Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return a.startOffset - b.startOffset;
  });
}
