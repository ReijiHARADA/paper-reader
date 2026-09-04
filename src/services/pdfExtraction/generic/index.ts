/**
 * Generic layout engine lives in pdfLayout.ts (column order, masthead,
 * headings, captions). This module is the evidence-generator facade.
 */
export { generateGenericCandidates } from "./candidates";
export type { GenericExtraction, RoleCandidate } from "./candidates";
