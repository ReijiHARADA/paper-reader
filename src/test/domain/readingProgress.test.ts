import { describe, expect, it } from "vitest";
import {
  continueReadingPapers,
  formatReadingProgress,
  formatRelativeOpenedAt,
  readingProgressPercent,
} from "../../domain/readingProgress";
import type { Paper } from "../../types/paper";

function paper(partial: Partial<Paper> & { id: string }): Paper {
  return {
    sourceFilePath: `${partial.id}.pdf`,
    sourceFileHash: partial.id,
    titleOriginal: partial.id,
    titleTranslated: null,
    authors: [],
    publication: null,
    year: null,
    pageCount: 1,
    processingStatus: "ready",
    lastReadBlockId: null,
    lastReadOffset: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...partial,
  };
}

describe("reading progress", () => {
  it("returns percent from block order", () => {
    expect(
      readingProgressPercent("b2", [
        { id: "b1", order: 0 },
        { id: "b2", order: 1 },
        { id: "b3", order: 2 },
        { id: "b4", order: 3 },
      ])
    ).toBe(50);
    expect(formatReadingProgress(42)).toBe("42%まで読了");
    expect(formatReadingProgress(null)).toBeNull();
  });

  it("picks recently opened papers first", () => {
    const papers = [
      paper({ id: "old", lastOpenedAt: "2026-09-01T00:00:00.000Z" }),
      paper({ id: "new", lastOpenedAt: "2026-09-05T00:00:00.000Z" }),
      paper({ id: "unread" }),
    ];
    expect(continueReadingPapers(papers, 2).map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("formats relative opened dates", () => {
    const now = Date.parse("2026-09-05T12:00:00.000Z");
    expect(formatRelativeOpenedAt("2026-09-05T08:00:00.000Z", now)).toBe("今日");
    expect(formatRelativeOpenedAt("2026-09-04T08:00:00.000Z", now)).toBe("昨日");
  });
});
