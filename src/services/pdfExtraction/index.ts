export type { Evidence, EvidenceSource, FormatId, DocumentEvidence } from "./types";
export { detectFormat, FORMAT_PROFILES, acmProfile, ieeeProfile, genericProfile } from "./formats";
export { evidenceFromPages, extractDoiHints } from "./evidence";
export { fuseTitle } from "./fusion";
export { parseGrobidHeaderTei } from "./grobid/tei";
export { grobidBaseUrl } from "./grobid/client";
export { evaluateBaselinePaper } from "./benchmark";
export { classifyDocument, classifyPage, scannedByItemAverage } from "./pageClass";
export { assignNativeTextToBoxes } from "./layoutAssign";
