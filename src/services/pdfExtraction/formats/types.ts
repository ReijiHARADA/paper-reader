import type { DocumentEvidence, FormatId } from "../types";

export type FormatProfile = {
  id: FormatId;
  detect(document: DocumentEvidence): number;
  hardRules: string[];
  scoreAdjustments: string[];
  firstPageRules: string[];
  headingRules: string[];
  boilerplateRules: string[];
};

export const APPLY_MIN = 0.75;
export const APPLY_MARGIN = 0.12;

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function contains(haystack: string, needle: RegExp): boolean {
  return needle.test(haystack);
}
