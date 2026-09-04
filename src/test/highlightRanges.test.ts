import { describe, expect, it } from "vitest";
import { splitHighlightedText } from "../services/highlightRanges";

describe("splitHighlightedText", () => {
  it("returns the full string when there are no ranges", () => {
    expect(splitHighlightedText("abc", [])).toEqual([
      { text: "abc", annotationIds: [] },
    ]);
  });

  it("splits overlapping ranges without dropping either annotation", () => {
    const segments = splitHighlightedText("0123456789", [
      { id: "A", start: 1, end: 5 },
      { id: "B", start: 3, end: 8 },
    ]);
    const withIds = segments.filter((s) => s.annotationIds.length > 0);
    expect(withIds.some((s) => s.annotationIds.includes("A"))).toBe(true);
    expect(withIds.some((s) => s.annotationIds.includes("B"))).toBe(true);
    expect(segments.some((s) => s.annotationIds.includes("A") && s.annotationIds.includes("B"))).toBe(
      true
    );
    expect(segments.map((s) => s.text).join("")).toBe("0123456789");
  });

  it("skips orphaned ranges", () => {
    const segments = splitHighlightedText("hello", [
      { id: "A", start: 0, end: 5, status: "orphaned" },
    ]);
    expect(segments).toEqual([{ text: "hello", annotationIds: [] }]);
  });
});
