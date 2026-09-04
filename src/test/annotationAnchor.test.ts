import { describe, expect, it } from "vitest";
import {
  captureContext,
  offsetsMatchSelectedText,
  reanchorAnnotation,
} from "../services/annotationAnchor";
import type { Annotation } from "../types/annotation";

function ann(partial: Partial<Annotation> & Pick<Annotation, "selectedText">): Annotation {
  return {
    id: "a1",
    paperId: "p1",
    projectId: null,
    blockId: "b1",
    startOffset: 0,
    endOffset: partial.selectedText.length,
    prefixContext: "",
    suffixContext: "",
    translationTextHash: "hash-old",
    note: "memo",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("selection offsets", () => {
  it("slice(start, end) matches selectedText", () => {
    const translated = "ウェアラブル技術とジュエリーの歴史が交わる場所にインタラクティブジュエリーが現れる";
    const selectedText = "インタラクティブジュエリーが現れる";
    const startOffset = translated.indexOf(selectedText);
    const endOffset = startOffset + selectedText.length;
    expect(offsetsMatchSelectedText(translated, startOffset, endOffset, selectedText)).toBe(
      true
    );
    expect(translated.slice(startOffset, endOffset)).toBe(selectedText);
  });

  it("captures prefix and suffix context within 40-80 characters", () => {
    const text = "あ".repeat(30) + "TARGET" + "い".repeat(30);
    const start = 30;
    const end = 36;
    const { prefixContext, suffixContext } = captureContext(text, start, end);
    expect(prefixContext.length).toBeGreaterThanOrEqual(30);
    expect(prefixContext.length).toBeLessThanOrEqual(80);
    expect(suffixContext.length).toBeGreaterThanOrEqual(30);
    expect(suffixContext.length).toBeLessThanOrEqual(80);
    expect(prefixContext.endsWith("あ".repeat(10))).toBe(true);
  });
});

describe("reanchorAnnotation", () => {
  it("Case A: same hash keeps original offsets", () => {
    const translated = "こんにちは世界とその周辺";
    const selected = "世界";
    const start = translated.indexOf(selected);
    const result = reanchorAnnotation(
      ann({
        selectedText: selected,
        startOffset: start,
        endOffset: start + selected.length,
        translationTextHash: "same",
      }),
      translated,
      "same"
    );
    expect(result.status).toBe("active");
    expect(result.startOffset).toBe(start);
    expect(result.endOffset).toBe(start + selected.length);
  });

  it("Case B: unique selectedText moves to the new location", () => {
    const oldText = "AAA 重要な文章 BBB";
    const selected = "重要な文章";
    const start = oldText.indexOf(selected);
    const newText = "導入 " + selected + " 結論";
    const result = reanchorAnnotation(
      ann({
        selectedText: selected,
        startOffset: start,
        endOffset: start + selected.length,
        translationTextHash: "old",
        prefixContext: "AAA ",
        suffixContext: " BBB",
      }),
      newText,
      "new"
    );
    expect(result.status).toBe("active");
    expect(result.startOffset).toBe(newText.indexOf(selected));
    expect(result.translationTextHash).toBe("new");
    expect(newText.slice(result.startOffset, result.endOffset)).toBe(selected);
  });

  it("Case C: duplicate selectedText uses prefix/suffix to pick the closest match", () => {
    const selected = "同じ文";
    const newText = "前置き " + selected + " 中間 " + selected + " 後置き";
    const second = newText.lastIndexOf(selected);
    const result = reanchorAnnotation(
      ann({
        selectedText: selected,
        startOffset: 0,
        endOffset: selected.length,
        translationTextHash: "old",
        prefixContext: "中間 ",
        suffixContext: " 後置き",
      }),
      newText,
      "new"
    );
    expect(result.status).toBe("active");
    expect(result.startOffset).toBe(second);
  });

  it("Case D: missing text becomes orphaned and keeps the note", () => {
    const result = reanchorAnnotation(
      ann({
        selectedText: "存在しない引用",
        note: "残すべきメモ",
        translationTextHash: "old",
      }),
      "全く別の翻訳文です",
      "new"
    );
    expect(result.status).toBe("orphaned");
    expect(result.note).toBe("残すべきメモ");
    expect(result.selectedText).toBe("存在しない引用");
  });
});
