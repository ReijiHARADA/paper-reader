import { describe, expect, it } from "vitest";
import { filterPapersByLibraryQuery, matchesLibraryQuery } from "../../domain/librarySearch";
import type { Paper } from "../../types/paper";

const paper: Paper = {
  id: "p1",
  sourceFilePath: "design.pdf",
  sourceFileName: "design.pdf",
  sourceFileHash: "h",
  titleOriginal: "Human-AI Collaboration",
  titleTranslated: "人とAIの協働",
  authors: ["Smith"],
  publication: "CHI",
  year: 2024,
  pageCount: 10,
  processingStatus: "ready",
  lastReadBlockId: null,
  lastReadOffset: null,
  createdAt: "t",
  updatedAt: "t",
};

describe("library search", () => {
  it("matches title, authors, and filename", () => {
    expect(matchesLibraryQuery(paper, "協働")).toBe(true);
    expect(matchesLibraryQuery(paper, "smith")).toBe(true);
    expect(matchesLibraryQuery(paper, "design")).toBe(true);
    expect(matchesLibraryQuery(paper, "quantum")).toBe(false);
  });

  it("returns all papers for an empty query", () => {
    expect(filterPapersByLibraryQuery([paper], "  ")).toEqual([paper]);
  });
});
