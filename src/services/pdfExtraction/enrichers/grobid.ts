import { grobidBaseUrl, processHeaderDocument } from "../grobid/client";
import type { ExtractionEnricher } from "./types";
import type { ExtractionEvidence } from "../types";

/**
 * Optional local GROBID. Never a production dependency.
 */
export const grobidEnricher: ExtractionEnricher = {
  id: "grobid",
  shouldRun(context) {
    if (!grobidBaseUrl() || !context.pdfBytes) return false;
    const semantic = context.canonical?.diagnostics.semanticConfidence ?? 0;
    return semantic < 0.7;
  },
  async extract(context) {
    if (!context.pdfBytes) return [];
    try {
      const header = await processHeaderDocument(context.pdfBytes);
      const evidence: ExtractionEvidence[] = [];
      if (header.title) {
        evidence.push({
          source: "grobid",
          label: "title",
          confidence: 0.9,
          reason: header.title.slice(0, 120),
        });
      }
      for (const author of header.authors) {
        evidence.push({
          source: "grobid",
          label: "author",
          confidence: 0.88,
          reason: author,
        });
      }
      for (const link of header.links) {
        evidence.push({
          source: "grobid",
          label: "AFFILIATED_WITH",
          confidence: 0.86,
          reason: `${link.author} => ${link.affiliation}`,
        });
      }
      return evidence;
    } catch {
      return [];
    }
  },
};
