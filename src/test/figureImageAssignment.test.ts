import { describe, expect, it } from "vitest";
import { assignRectsToRegions } from "../services/pdfLayout";

describe("assignRectsToRegions", () => {
  it("gives each image to the caption whose crop it actually overlaps most", () => {
    const leftCrop = { x: 40, y: 205, width: 265, height: 82 };
    const rightCrop = { x: 311, y: 261, width: 289, height: 150 };
    const leftImage = { id: "left", x: 54, y: 200, width: 241, height: 75 };
    const rightImage = { id: "right", x: 317, y: 257, width: 257, height: 143 };

    const grouped = assignRectsToRegions([leftImage, rightImage], [
      { id: "fig-a", rect: leftCrop },
      { id: "fig-b", rect: rightCrop },
    ]);

    expect(grouped.get("fig-a")?.map((img) => img.id)).toEqual(["left"]);
    expect(grouped.get("fig-b")?.map((img) => img.id)).toEqual(["right"]);
  });

  it("does not assign a neighbor image that only touches a padded crop band", () => {
    const leftCrop = { x: 40, y: 205, width: 265, height: 82 };
    const neighbor = { id: "neighbor", x: 317, y: 257, width: 257, height: 143 };

    const grouped = assignRectsToRegions([neighbor], [
      { id: "fig-a", rect: leftCrop },
    ]);

    expect(grouped.get("fig-a")).toEqual([]);
  });

  it("keeps multiple panels that overlap the same caption crop", () => {
    const crop = { x: 40, y: 80, width: 260, height: 160 };
    const panelA = { id: "a", x: 50, y: 90, width: 110, height: 130 };
    const panelB = { id: "b", x: 170, y: 90, width: 110, height: 130 };

    const grouped = assignRectsToRegions([panelA, panelB], [
      { id: "fig-a", rect: crop },
    ]);

    expect(grouped.get("fig-a")?.map((img) => img.id)).toEqual(["a", "b"]);
  });
});
