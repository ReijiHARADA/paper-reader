import type { DocumentEvidence } from "../types";
import { clamp01, contains, type FormatProfile } from "./types";

export const ieeeProfile: FormatProfile = {
  id: "ieee",
  detect(document: DocumentEvidence) {
    const text = `${document.firstPagesText}\n${document.fullTextSample}`;
    let score = 0;
    if (contains(text, /\bindex terms\b/i)) score += 0.32;
    if (contains(text, /authorized licensed use/i)) score += 0.22;
    if (contains(text, /\bieee\b/i) && contains(text, /copyright/i)) {
      score += 0.16;
    }
    if (document.doiHints.some((doi) => /10\.1109\//.test(doi))) score += 0.16;
    if (contains(text, /\b(iswc|percom|infocom|icra|cvpr)\b/i)) score += 0.1;
    if (document.firstPageTwoColumn) score += 0.08;
    return clamp01(score);
  },
  hardRules: [
    "Index Terms is a classification catalog, not a section to translate as prose",
    "IEEE copyright / licensed-use footers are chrome",
  ],
  scoreAdjustments: [
    "doi 10.1109 is a soft hint, never sufficient alone",
    "older ISWC templates vary; rely on Index Terms + footer together",
  ],
  firstPageRules: [
    "title, authors, abstract, then Index Terms before the two-column body",
  ],
  headingRules: [
    "I. INTRODUCTION roman numerals in some templates — treat as heading when short",
  ],
  boilerplateRules: [
    "Authorized licensed use limited to…",
    "IEEE copyright footer",
  ],
};
