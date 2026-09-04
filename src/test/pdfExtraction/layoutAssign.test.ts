import { describe, expect, it } from "vitest";
import { assignNativeTextToBoxes } from "../../services/pdfExtraction/layoutAssign";
import type { ExtractedTextItem } from "../../services/pdfService";

const item = (text: string, x: number, y: number): ExtractedTextItem => ({
  text,
  x,
  y,
  width: 40,
  height: 10,
  fontSize: 10,
  fontName: "Times",
  page: 1,
});

describe("native text assignment to visual boxes", () => {
  it("uses pdf.js strings inside a layout-model bbox", () => {
    const assigned = assignNativeTextToBoxes(
      [
        item("Interactive", 80, 90),
        item("Jewellery", 130, 90),
        item("Body paragraph starts here", 80, 240),
      ],
      [
        {
          id: "t1",
          label: "title",
          page: 1,
          x: 60,
          y: 70,
          width: 200,
          height: 40,
          confidence: 0.95,
        },
      ]
    );
    expect(assigned[0].original).toBe("Interactive Jewellery");
    expect(assigned[0].original).not.toMatch(/Body paragraph/);
  });
});
