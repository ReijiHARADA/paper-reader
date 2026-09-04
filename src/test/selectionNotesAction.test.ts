import { describe, expect, it } from "vitest";
import { selectionNotesAction } from "../components/reader/selection/selectionNotesAction";

describe("selectionNotesAction", () => {
  it("shows the add-memo button for a normal selection and does not open Notes", () => {
    expect(selectionNotesAction("ok")).toBe("show-add-memo");
  });

  it("shows the unsupported message for a cross-block selection", () => {
    expect(selectionNotesAction("cross-block")).toBe("show-cross-block");
  });

  it("does nothing for an empty selection", () => {
    expect(selectionNotesAction("empty")).toBe("none");
    expect(selectionNotesAction(undefined)).toBe("none");
  });
});
