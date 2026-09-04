import { describe, expect, it } from "vitest";
import { detectFormat } from "../../services/pdfExtraction/formats";
import type { DocumentEvidence } from "../../services/pdfExtraction/types";

function evidence(partial: Partial<DocumentEvidence>): DocumentEvidence {
  return {
    pageCount: 8,
    firstPageTwoColumn: false,
    columnPageRatio: 0,
    bodyFontSize: 10,
    pageWidth: 612,
    pageHeight: 792,
    firstPagesText: "",
    fullTextSample: "",
    titleCandidates: [],
    authorCandidates: [],
    affiliationCandidates: [],
    headingCandidates: [],
    captionCandidates: [],
    doiHints: [],
    ...partial,
  };
}

describe("format detection", () => {
  it("applies ACM when several independent signals agree", () => {
    const result = detectFormat(
      evidence({
        firstPageTwoColumn: true,
        firstPagesText: [
          "CCS Concepts: Human-centered computing",
          "Permission to make digital or hard copies of all or part of this work",
          "doi.org/10.1145/2839462.2839504",
          "CHI '16",
        ].join("\n"),
        doiHints: ["10.1145/2839462.2839504"],
      })
    );
    expect(result.applied).toBe("acm");
    expect(result.scores.acm).toBeGreaterThanOrEqual(0.75);
  });

  it("does not apply ACM from a DOI alone", () => {
    const result = detectFormat(
      evidence({
        doiHints: ["10.1145/2839462.2839504"],
        firstPagesText: "Some unrelated workshop notes",
      })
    );
    expect(result.applied).toBe("generic");
    expect(result.scores.acm).toBeLessThan(0.75);
  });

  it("keeps generic when ACM and IEEE scores are both middling", () => {
    const result = detectFormat(
      evidence({
        firstPagesText: "CCS Concepts\nIndex Terms",
        doiHints: ["10.1145/example", "10.1109/example"],
      })
    );
    expect(result.scores.acm).toBeGreaterThan(0.4);
    expect(result.scores.ieee).toBeGreaterThan(0.4);
    expect(result.applied).toBe("generic");
  });

  it("applies IEEE when Index Terms and licensed-use footer agree", () => {
    const result = detectFormat(
      evidence({
        firstPageTwoColumn: true,
        firstPagesText: [
          "Index Terms—Wearable computers, design",
          "Authorized licensed use limited to: Example. Downloaded on",
          "IEEE copyright",
          "10.1109/ISWC.1998.729537",
        ].join("\n"),
        doiHints: ["10.1109/ISWC.1998.729537"],
      })
    );
    expect(result.applied).toBe("ieee");
  });
});
