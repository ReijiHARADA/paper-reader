import { describe, expect, it } from "vitest";
import {
  isPlausibleJaTranslation,
  shouldTranslateTitle,
  shouldTranslateParagraph,
  shouldTranslateHeading,
  looksLikeSubjectClassification,
  evaluateJaTranslation,
  extractScientificInvariants,
} from "../services/translation/quality";
import { resolveImportConfig } from "../services/import/helpers";
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

  it("rejects fluent Japanese that drops scientific facts", () => {
    const source = "For n = 20, F(4,33) = 2.913 and p < 0.001 [12] were observed at 9.6 mm.";
    const output = "20人の参加者では有意な差が観察されました。";
    const quality = evaluateJaTranslation(output, source);
    expect(quality.invariantScore).toBeLessThan(0.5);
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("accepts academic Japanese while preserving scientific invariants", () => {
    const source = "For n = 20, F(4,33) = 2.913 and p < 0.001 [12] were observed at 9.6 mm.";
    const output = "n = 20では、9.6 mmにおいてF(4,33) = 2.913、p < 0.001という結果が観察された[12]。";
    expect(extractScientificInvariants(source).map((item) => item.value)).toContain("F(4,33) = 2.913");
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("rejects fluent phrase-loop output without relying on a vocabulary blacklist", () => {
    const source = "Wearable devices can support personal and social practices when their design starts from existing rituals.";
    const output = "ウェブアプリケーションの役割を明らかにするため、ウェブアプリケーションの役割を明らかにするため、ウェブアプリケーションの役割を明らかにするための研究を行った。";
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects repeated short Japanese propositions", () => {
    const source = "The course ends with group participation in a real experiment.";
    const output = "実験の結果、参加者は課題を完了した。実験の結果は、実験の結果と一致し、実験の結果を評価した。";
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });
});

describe("import translation concurrency", () => {
  it.each([2, 4, 8])("keeps configured queue concurrency %i", (translationConcurrency) => {
    expect(resolveImportConfig({ translationConcurrency }).translationConcurrency).toBe(translationConcurrency);
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

describe("unsafe extracted translation input", () => {
  it("keeps mixed permission text and incomplete continuations out of MADLAD", () => {
    expect(
      shouldTranslateParagraph(
        "Ppersonal or classroom use is granted without fee provided that copies are made for this work."
      )
    ).toBe(false);
    expect(
      shouldTranslateParagraph(
        "With the progress of detecting technologies, it is now appropriate to start looking at the possibilities of"
      )
    ).toBe(false);
    expect(
      shouldTranslateParagraph(
        "The paper examines a complete paragraph with enough ordinary prose to translate safely."
      )
    ).toBe(true);
  });

  it("keeps a paragraph contaminated by a running arXiv header as original", () => {
    expect(
      shouldTranslateParagraph(
        "Consumer response is complex and arXiv:2404.02175v5 13 Mar 2025 provides no prose boundary here."
      )
    ).toBe(false);
  });
});

describe("Japanese conference structure", () => {
  it("puts はじめに in the outline and extracts CJK authors", () => {
    const result = analyzeStructure(
      FIXTURES["japanese-conference"](),
      "paper-ja",
      "/tmp/ja.pdf",
      "hash-ja",
      { pageCount: 1 }
    );
    expect(result.paper.titleOriginal).toMatch(/情報採餌理論/);
    expect(result.paper.authors.some((name) => /栗原/.test(name))).toBe(true);
    expect(
      result.sections.some((s) => /1 はじめに/.test(s.originalTitle))
    ).toBe(true);
    expect(
      result.sections.some((s) => /Acquisition process/.test(s.originalTitle))
    ).toBe(false);
    expect(result.blocks.some((b) => b.type === "figure")).toBe(true);
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

  it("does not treat Array.some's index as a section-id set", () => {
    const block = makeBlock({});
    expect(
      finalizedTranslationStatus([block], isRetryableTranslationFailure)
    ).toBe("partial");
    expect(
      displayProcessingStatus("partial", [block], isRetryableTranslationFailure)
    ).toBe("partial");
  });
});
