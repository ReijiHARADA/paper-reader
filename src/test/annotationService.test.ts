import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { PaperBlock } from "../types/paper";
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotationsForPaper,
  updateAnnotationNote,
} from "../services/annotationService";
import { computeTextHash, getAnnotation } from "../services/database";

function block(partial: Partial<PaperBlock> & { id: string; translated: string }): PaperBlock {
  return {
    paperId: "paper-1",
    sectionId: null,
    type: "paragraph",
    order: 0,
    pageStart: 1,
    pageEnd: 1,
    boundingBoxes: [],
    original: "original",
    extractionConfidence: 0.9,
    translationStatus: "completed",
    parentBlockId: null,
    metadata: {},
    ...partial,
  };
}

describe("annotationService", () => {
  it("saves, reads, edits, and deletes an annotation", async () => {
    const translated = "選択した日本語の文章をここに置きます";
    const selectedText = "日本語の文章";
    const startOffset = translated.indexOf(selectedText);
    const created = await createAnnotation({
      paperId: "paper-crud",
      projectId: "project-a",
      blockId: "block-1",
      translated,
      startOffset,
      endOffset: startOffset + selectedText.length,
      selectedText,
      note: "最初のメモ",
    });

    expect(created.selectedText).toBe(selectedText);
    expect(translated.slice(created.startOffset, created.endOffset)).toBe(selectedText);
    expect(created.projectId).toBe("project-a");
    expect(created.translationTextHash).toBe(await computeTextHash(translated));

    const listed = await listAnnotationsForPaper("paper-crud", [
      block({ id: "block-1", translated, paperId: "paper-crud" }),
    ]);
    expect(listed).toHaveLength(1);
    expect(listed[0].note).toBe("最初のメモ");

    const edited = await updateAnnotationNote(listed[0], "更新したメモ");
    expect(edited.note).toBe("更新したメモ");
    expect(edited.selectedText).toBe(selectedText);
    expect(edited.startOffset).toBe(created.startOffset);

    await deleteAnnotation(edited.id);
    expect(await getAnnotation(edited.id)).toBeUndefined();
    const afterDelete = await listAnnotationsForPaper("paper-crud", [
      block({ id: "block-1", translated, paperId: "paper-crud" }),
    ]);
    expect(afterDelete).toHaveLength(0);
  });

  it("re-anchors after translation changes and keeps orphaned notes", async () => {
    const original = "これは元の翻訳文の引用部分です";
    const selectedText = "引用部分";
    const startOffset = original.indexOf(selectedText);
    await createAnnotation({
      paperId: "paper-reanchor",
      projectId: null,
      blockId: "block-2",
      translated: original,
      startOffset,
      endOffset: startOffset + selectedText.length,
      selectedText,
      note: "残るメモ",
    });

    const moved = "新しい導入 " + selectedText + " です";
    const movedList = await listAnnotationsForPaper("paper-reanchor", [
      block({ id: "block-2", translated: moved, paperId: "paper-reanchor", order: 1 }),
    ]);
    expect(movedList[0].status).toBe("active");
    expect(moved.slice(movedList[0].startOffset, movedList[0].endOffset)).toBe(
      selectedText
    );

    const gone = await listAnnotationsForPaper("paper-reanchor", [
      block({
        id: "block-2",
        translated: "完全に別の文章になりました",
        paperId: "paper-reanchor",
        order: 1,
      }),
    ]);
    expect(gone[0].status).toBe("orphaned");
    expect(gone[0].note).toBe("残るメモ");
    expect(gone[0].selectedText).toBe(selectedText);
  });

  it("allows empty notes as highlight-only annotations", async () => {
    const translated = "ハイライトだけ残したい文章";
    const selectedText = "ハイライトだけ";
    const startOffset = translated.indexOf(selectedText);
    const created = await createAnnotation({
      paperId: "paper-hl",
      projectId: null,
      blockId: "block-3",
      translated,
      startOffset,
      endOffset: startOffset + selectedText.length,
      selectedText,
      note: "",
    });
    expect(created.note).toBe("");
  });
});
