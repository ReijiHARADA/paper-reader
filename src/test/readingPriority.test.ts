import { describe, expect, it } from "vitest";
import { TranslationPriority } from "../services/translation/types";
import { prioritiesAroundBlock } from "../services/translation/readingPriority";

describe("prioritiesAroundBlock", () => {
  it("marks N and N+1 as CRITICAL and later blocks as HIGH/MEDIUM/LOW", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const map = prioritiesAroundBlock(ids, "c");
    expect(map.get("c")).toBe(TranslationPriority.CRITICAL);
    expect(map.get("d")).toBe(TranslationPriority.CRITICAL);
    expect(map.get("e")).toBe(TranslationPriority.HIGH);
    expect(map.get("f")).toBe(TranslationPriority.HIGH);
    expect(map.get("g")).toBe(TranslationPriority.MEDIUM);
    expect(map.get("h")).toBe(TranslationPriority.MEDIUM);
    expect(map.get("a")).toBe(TranslationPriority.LOW);
    expect(map.get("b")).toBe(TranslationPriority.LOW);
  });
});
