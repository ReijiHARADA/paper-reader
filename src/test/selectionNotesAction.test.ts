import { describe, expect, it } from "vitest";
import {
  bodyMemoOpensNotesInspector,
  selectionNotesAction,
} from "../components/reader/selection/selectionNotesAction";

describe("selectionNotesAction", () => {
  it("shows the add-memo button for a normal selection and does not open Notes", () => {
    expect(selectionNotesAction("ok")).toBe("show-compose");
  });

  it("shows the unsupported message for a cross-block selection", () => {
    expect(selectionNotesAction("cross-block")).toBe("show-cross-block");
  });

  it("does nothing for an empty selection", () => {
    expect(selectionNotesAction("empty")).toBe("none");
    expect(selectionNotesAction(undefined)).toBe("none");
  });

  it("never opens the Notes inspector from a body memo action", () => {
    expect(bodyMemoOpensNotesInspector()).toBe(false);
  });
});
