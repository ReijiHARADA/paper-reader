import { describe, expect, it } from "vitest";
import { authorDisplayNames, paperMetadataFromPaper } from "../../domain/paper";
import { blockKey, sameBlockKey } from "../../domain/blockKey";
import { paperToPaperJson } from "../../data/package/fromProjection";
import { stableBlockId } from "../../data/package/ids";
import { remapAnnotationBlockIds, remapReadingBlockId } from "../../data/package/reconcile";
import type { Paper } from "../../types/paper";

const paper: Paper = {
  id: "p1",
  sourceFilePath: "a.pdf",
  sourceFileHash: "h",
  titleOriginal: "Title",
  titleTranslated: null,
  authors: ["Ada Lovelace"],
  authorsStructured: [
    { id: "auth-ada", name: "Ada Lovelace", affiliationIds: ["aff-1"] },
  ],
  affiliations: [{ id: "aff-1", name: "Analytical Engine Lab" }],
  doi: "10.1145/example",
  publication: null,
  year: 2024,
  pageCount: 1,
  processingStatus: "ready",
  lastReadBlockId: null,
  lastReadOffset: null,
  createdAt: "t",
  updatedAt: "t",
};

describe("paper model split", () => {
  it("keeps structured authors and doi when writing paper.json", () => {
    const json = paperToPaperJson(paper, 3);
    expect(json.authors).toEqual([
      { id: "auth-ada", name: "Ada Lovelace", affiliationIds: ["aff-1"] },
    ]);
    expect(json.affiliations).toEqual([{ id: "aff-1", name: "Analytical Engine Lab" }]);
    expect(json.doi).toBe("10.1145/example");
    expect(authorDisplayNames(json.authors)).toEqual(["Ada Lovelace"]);
    expect(paperMetadataFromPaper(paper).authors[0].id).toBe("auth-ada");
  });

  it("scopes block keys to a paper", () => {
    expect(sameBlockKey(blockKey("p1", "b1"), blockKey("p1", "b1"))).toBe(true);
    expect(sameBlockKey(blockKey("p1", "b1"), blockKey("p2", "b1"))).toBe(false);
  });

  it("builds stable block ids from text, page, and bbox instead of order", () => {
    const first = stableBlockId({
      type: "paragraph",
      page: 1,
      text: "Hello",
      bbox: { x: 10, y: 20, width: 100, height: 40 },
      order: 0,
    });
    const later = stableBlockId({
      type: "paragraph",
      page: 1,
      text: "Hello",
      bbox: { x: 11, y: 21, width: 100, height: 40 },
      order: 9,
    });
    expect(first).toBe(later);
  });

  it("remaps annotations and reading position after reconcile", () => {
    const matches = [{ previousId: "old", nextId: "new", score: 10 }];
    expect(remapAnnotationBlockIds([{ blockId: "new", note: "x" }], matches)).toEqual([
      { blockId: "old", note: "x" },
    ]);
    expect(remapReadingBlockId("new", matches)).toBe("old");
  });
});
