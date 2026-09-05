import { describe, expect, it } from "vitest";
import {
  derivePaperReadiness,
  formatTranslationProgressLabel,
  hasReadableBody,
  translationPercent,
} from "../../domain/paperReadiness";
import type { PaperBlock } from "../../types/paper";

function block(partial: Partial<PaperBlock> & { id: string }): PaperBlock {
  return {
    paperId: "p1",
    sectionId: null,
    type: "paragraph",
    order: 0,
    pageStart: 1,
    pageEnd: 1,
    boundingBoxes: [],
    original: "Hello",
    translated: null,
    extractionConfidence: 1,
    translationStatus: "pending",
    parentBlockId: null,
    metadata: {},
    ...partial,
  };
}

describe("paper readiness", () => {
  it("treats extraction without body as preparing", () => {
    const view = derivePaperReadiness({ processingStatus: "extracting" });
    expect(view).toEqual({ readiness: "preparing", label: "準備中", canOpen: false });
  });

  it("treats translating with body as readable-enough", () => {
    const view = derivePaperReadiness({
      processingStatus: "translating",
      blocks: [block({ id: "b1" })],
    });
    expect(view.readiness).toBe("translating");
    expect(view.canOpen).toBe(true);
  });

  it("maps partial and failed to needs_attention", () => {
    expect(derivePaperReadiness({ processingStatus: "partial", blocks: [block({ id: "b1" })] }).readiness).toBe(
      "needs_attention"
    );
    expect(derivePaperReadiness({ processingStatus: "failed" }).readiness).toBe("needs_attention");
  });

  it("computes translation percent from should-translate blocks", () => {
    const blocks = [
      block({ id: "a", translationStatus: "completed" }),
      block({ id: "b", translationStatus: "pending" }),
    ];
    expect(translationPercent(blocks, () => true)).toBe(50);
    expect(formatTranslationProgressLabel("translating", 50)).toBe("日本語化中 50%");
  });

  it("ignores reference-only bodies", () => {
    expect(
      hasReadableBody([
        block({ id: "r", type: "reference", original: "Smith 2020" }),
      ])
    ).toBe(false);
  });
});
