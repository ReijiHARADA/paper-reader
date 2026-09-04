import type { DocumentEvidence } from "../types";
import { clamp01, contains, type FormatProfile } from "./types";

export const acmProfile: FormatProfile = {
  id: "acm",
  detect(document: DocumentEvidence) {
    const text = `${document.firstPagesText}\n${document.fullTextSample}`;
    let score = 0;
    if (contains(text, /\bccs concepts\b/i)) score += 0.28;
    if (contains(text, /\bacm classification keywords?\b/i)) score += 0.18;
    if (contains(text, /\bauthor keywords?\b/i)) score += 0.1;
    if (contains(text, /permission to make digital or hard copies/i)) score += 0.28;
    if (contains(text, /\bacm reference format\b/i)) score += 0.16;
    if (document.doiHints.some((doi) => /10\.1145\//.test(doi))) score += 0.16;
    if (
      contains(
        text,
        /\b(tei|chi|uist|cscw|imwut|ubicomp|iss|dis)\s*['’]?\d{0,4}\b/i
      )
    ) {
      score += 0.1;
    }
    if (document.firstPageTwoColumn) score += 0.08;
    return clamp01(score);
  },
  hardRules: [
    "CCS Concepts / ACM Classification Keywords are catalog, not body headings to translate",
    "ACM copyright boilerplate is copyright, not a paragraph",
    "Author Keywords is a front-matter label",
  ],
  scoreAdjustments: [
    "page-1 spanning band above Abstract is masthead",
    "doi 10.1145 is a soft publisher hint, never sufficient alone",
  ],
  firstPageRules: [
    "full-width title then authors then Abstract, then 2-column body",
    "email lines in masthead are authors, not headings",
  ],
  headingRules: [
    "numbered 1 Introduction / 2 Related Work",
    "do not promote CCS concept trees to sections",
  ],
  boilerplateRules: [
    "Proceedings of TEI/CHI/UIST… running header",
    "Permission to make digital or hard copies…",
  ],
};
