import { describe, expect, it } from "vitest";
import { splitCaptionLabel } from "../../components/reader/caption";

describe("splitCaptionLabel", () => {
  it("renders a figure number once when the caption repeats it", () => {
    expect(splitCaptionLabel("Figure 1. A wearable interface.", "Figure 1")).toEqual({
      label: "Figure 1",
      text: "A wearable interface.",
    });
  });

  it("uses a translated Japanese figure label", () => {
    expect(splitCaptionLabel("図1：身につけるインターフェース", "Figure 1")).toEqual({
      label: "図 1",
      text: "身につけるインターフェース",
    });
  });
});
