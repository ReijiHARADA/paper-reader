import { describe, expect, it } from "vitest";
import {
  isPlausibleJaTranslation,
  shouldTranslateTitle,
  shouldTranslateParagraph,
  shouldTranslateHeading,
  looksLikeSubjectClassification,
} from "../services/translation/quality";
import { analyzeStructure } from "../services/structureService";
import { FIXTURES } from "./readingOrder/builders";

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
  });
});
