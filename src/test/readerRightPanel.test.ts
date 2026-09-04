import { describe, expect, it } from "vitest";
import {
  toggleReaderRightPanel,
  type ReaderRightPanel,
} from "../utils/readerRightPanel";

describe("toggleReaderRightPanel", () => {
  it("opens glossary from none and from notes, and closes glossary", () => {
    expect(toggleReaderRightPanel("none", "glossary")).toBe("glossary");
    expect(toggleReaderRightPanel("notes", "glossary")).toBe("glossary");
    expect(toggleReaderRightPanel("glossary", "glossary")).toBe("none");
  });

  it("opens notes from none and from glossary, and closes notes", () => {
    expect(toggleReaderRightPanel("none", "notes")).toBe("notes");
    expect(toggleReaderRightPanel("glossary", "notes")).toBe("notes");
    expect(toggleReaderRightPanel("notes", "notes")).toBe("none");
  });

  it("never returns a combined panel", () => {
    const states: ReaderRightPanel[] = ["none", "notes", "glossary"];
    for (const current of states) {
      const next = toggleReaderRightPanel(current, "notes");
      expect(next === "none" || next === "notes").toBe(true);
      expect(next).not.toBe("glossary");
    }
  });
});
