import { describe, expect, it } from "vitest";
import {
  classifyExtractionConfidence,
  isLowExtractionConfidence,
  scoreLayoutBlock,
} from "../services/extractionConfidence";
import type { LayoutBlock } from "../services/pdfLayout";

const block = (text: string, extras: Partial<LayoutBlock> = {}): LayoutBlock => ({
  role: "paragraph",
  text,
  lines: [
    {
      text,
      items: [],
      page: 1,
      column: "left",
      x: 50,
      y: 100,
      width: 200,
      height: 12,
      fontSize: 10,
      bbox: { page: 1, x: 50, y: 100, width: 200, height: 12 },
    },
  ],
  pageStart: 1,
  pageEnd: 1,
  column: "left",
  bbox: { page: 1, x: 50, y: 100, width: 200, height: 12 },
  ...extras,
});

describe("extraction confidence", () => {
  it("classifies high / medium / low bands", () => {
    expect(classifyExtractionConfidence(0.95)).toBe("high");
    expect(classifyExtractionConfidence(0.75)).toBe("medium");
    expect(classifyExtractionConfidence(0.4)).toBe("low");
    expect(isLowExtractionConfidence(0.69)).toBe(true);
    expect(isLowExtractionConfidence(0.7)).toBe(false);
  });

  it("lowers unicode confidence when replacement characters appear", () => {
    const good = scoreLayoutBlock(block("A reasonably long paragraph about jewelry and wearable computing devices."));
    const bad = scoreLayoutBlock(block("Broken \uFFFD text \uFFFD from a bad extract"));
    expect(bad.diagnostics.unicodeConfidence).toBeLessThan(
      good.diagnostics.unicodeConfidence
    );
    expect(bad.score).toBeLessThan(good.score);
  });
});
