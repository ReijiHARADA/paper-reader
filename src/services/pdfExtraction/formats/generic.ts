import type { FormatProfile } from "./types";

export const genericProfile: FormatProfile = {
  id: "generic",
  detect() {
    return 0;
  },
  hardRules: [],
  scoreAdjustments: [
    "largest-font page-1 line is the title candidate",
    "masthead ends at Abstract / Introduction / 1 はじめに",
    "numbered headings and NAMED_HEADINGS",
    "Figure/Fig./表/図 captions",
    "left-then-right column order with spanning bands",
  ],
  firstPageRules: [
    "title font >= body * 1.28",
    "authors via person-name tokens; affiliations via institution lexicon",
  ],
  headingRules: [
    "digit.digit numbering",
    "Japanese はじめに / 参考文献",
    "font-size ratio vs body for Latin ALL-CAPS",
  ],
  boilerplateRules: [
    "repeated header/footer strings",
    "Permission to make digital or hard copies (copyright role)",
  ],
};
