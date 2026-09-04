import { describe, expect, it } from "vitest";
import {
  isPlausibleJaTranslation,
  shouldTranslateTitle,
  shouldTranslateParagraph,
  shouldTranslateHeading,
  looksLikeSubjectClassification,
} from "../services/translation/quality";
import { analyzeStructure } from "../services/structureService";
import {
  isRetryableTranslationFailure,
  shouldTranslateBlock,
} from "../services/importServiceV2";
import {
  displayProcessingStatus,
  finalizedTranslationStatus,
} from "../services/paperStatus";
import { FIXTURES } from "./readingOrder/builders";
import type { PaperBlock } from "../types/paper";

describe("isPlausibleJaTranslation", () => {
  const source =
    "This research was supported by STW VIDI grant number 016.128.303 Research (NWO), awarded to Elise van den Hoven.";

  it("keeps a Japanese translation that retains grant identifiers from the source", () => {
    expect(
      isPlausibleJaTranslation(
        "本研究は STW VIDI grant number 016.128.303 によって支援され、Elise van den Hoven に授与された。",
        source
      )
    ).toBe(true);
  });

  it("rejects an English echo of the source", () => {
    expect(isPlausibleJaTranslation(source, source)).toBe(false);
  });
});

describe("shouldTranslateTitle", () => {
  it("does not send a dotted grant identifier as a paper title", () => {
    expect(shouldTranslateTitle("016.128.303")).toBe(false);
  });
});

describe("subject classification lines", () => {
  const ccs1998 =
    "H.5.m. Information interfaces and presentation (e.g., HCI): Miscellaneous; H.5.2 User interfaces.";

  it("detects ACM CCS 1998 catalog lines including the miscellaneous letter suffix", () => {
    expect(looksLikeSubjectClassification(ccs1998)).toBe(true);
    expect(shouldTranslateParagraph(ccs1998)).toBe(false);
    expect(shouldTranslateHeading("ACM Classification Keywords")).toBe(false);
    expect(shouldTranslateHeading("Author Keywords")).toBe(false);
    expect(shouldTranslateHeading("CCS Concepts")).toBe(false);
    expect(shouldTranslateHeading("Index Terms")).toBe(false);
  });

  it("detects CCS 2012 concept trees", () => {
    expect(
      looksLikeSubjectClassification(
        "• Human-centered computing → Interaction devices"
      )
    ).toBe(true);
  });

  it("still translates body prose that happens to mention a classifier code", () => {
    const prose =
      "However, H.5.2 style interfaces are common in this field of research today and deserve a full translated paragraph.";
    expect(looksLikeSubjectClassification(prose)).toBe(false);
    expect(shouldTranslateParagraph(prose)).toBe(true);
  });

  it("marks classification catalog paragraphs as skipped at structure time", () => {
    const result = analyzeStructure(
      FIXTURES["classification-index"](),
      "paper-classif",
      "/tmp/classif.pdf",
      "hash-classif",
      { pageCount: 1 }
    );
    const catalog = result.blocks.find((b) => /H\.5\.m/.test(b.original || ""));
    expect(catalog?.type).toBe("paragraph");
    expect(catalog?.translationStatus).toBe("skipped");
    const prose = result.blocks.find((b) => /CLASSIFIX_INTRO/.test(b.original || ""));
    expect(prose?.translationStatus).toBe("pending");
    const introHeading = result.blocks.find(
      (b) => b.type === "heading" && /^Introduction$/i.test(b.original || "")
    );
    expect(introHeading?.translationStatus).toBe("skipped");
  });
});

describe("isRetryableTranslationFailure", () => {
  const prose =
    "This opening paragraph explains the problem in a single column layout with enough words to look like body text.";

  function makeBlock(overrides: Partial<PaperBlock>): PaperBlock {
    return {
      id: "b1",
      paperId: "p1",
      sectionId: "s1",
      type: "paragraph",
      order: 0,
      pageStart: 1,
      pageEnd: 1,
      boundingBoxes: [],
      original: prose,
      translated: null,
      extractionConfidence: 1,
      translationStatus: "failed",
      parentBlockId: null,
      metadata: {},
      ...overrides,
    };
  }

  it("counts a failed body paragraph that the reader can retry", () => {
    const block = makeBlock({});
    expect(shouldTranslateBlock(block)).toBe(true);
    expect(isRetryableTranslationFailure(block)).toBe(true);
  });

  it("does not count failed heading blocks that the reader never renders", () => {
    const block = makeBlock({
      type: "heading",
      original: "Introduction",
    });
    expect(shouldTranslateBlock(block)).toBe(false);
    expect(isRetryableTranslationFailure(block)).toBe(false);
  });

  it("does not count failed figure captions that the reader shows as original", () => {
    const block = makeBlock({
      type: "figure",
      original: "Figure 1. A wearable prototype on a table.",
    });
    expect(isRetryableTranslationFailure(block)).toBe(false);
    expect(
      finalizedTranslationStatus([block], isRetryableTranslationFailure)
    ).toBe("ready");
    expect(
      displayProcessingStatus("partial", [block], isRetryableTranslationFailure)
    ).toBe("ready");
  });

  it("keeps stored partial until blocks are loaded", () => {
    expect(
      displayProcessingStatus("partial", undefined, isRetryableTranslationFailure)
    ).toBe("partial");
  });
});
