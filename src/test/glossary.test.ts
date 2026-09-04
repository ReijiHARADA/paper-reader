import { describe, expect, it } from "vitest";
import { applyGlossary } from "../services/llm/glossaryService";
import {
  expandCitationKeys,
  indexReferenceBlocks,
  parseCitationGroups,
  uniqueCitationTarget,
} from "../services/citations";
import { classifyPdfOpenError } from "../services/pdfOpenError";
import type { PaperBlock } from "../types/paper";

describe("applyGlossary", () => {
  const glossary = [
    { term: "interactive jewellery", translation: "インタラクティブジュエリー" },
    { term: "embodiment", translation: "身体性" },
  ];

  it("replaces leftover English terms after translation", () => {
    expect(
      applyGlossary("この研究は interactive jewellery を扱う。", glossary)
    ).toContain("インタラクティブジュエリー");
  });

  it("normalizes parenthetical English terms", () => {
    expect(applyGlossary("身体性（embodiment）が重要である。", glossary)).toContain(
      "身体性（embodiment）"
    );
  });
});

describe("citations", () => {
  it("expands ranges only when the span is small", () => {
    expect(expandCitationKeys("1-3")).toEqual(["1", "2", "3"]);
    expect(expandCitationKeys("1-99")).toEqual([]);
  });

  it("links a unique [n] to the matching reference block", () => {
    const blocks = [
      {
        id: "ref-12",
        type: "reference",
        original: "[12] Cameron S. Miner. 2001. Digital jewelry.",
        metadata: {},
      },
    ] as PaperBlock[];
    const index = indexReferenceBlocks(blocks);
    const groups = parseCitationGroups("see prior work [12] for details.");
    expect(groups[0]?.keys).toEqual(["12"]);
    expect(uniqueCitationTarget(groups[0].keys, index)).toBe("ref-12");
    expect(uniqueCitationTarget(["4"], index)).toBeNull();
  });
});

describe("classifyPdfOpenError", () => {
  it("maps PasswordException to a Japanese password-protected message", () => {
    const error = Object.assign(new Error("No password given"), {
      name: "PasswordException",
    });
    const classified = classifyPdfOpenError(error);
    expect(classified.code).toBe("password_protected");
    expect(classified.message).toMatch(/パスワード/);
  });
});
