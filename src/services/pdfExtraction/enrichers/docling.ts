import type { ExtractionEnricher } from "./types";

/**
 * Placeholder. Docling is not a production dependency.
 */
export const doclingEnricher: ExtractionEnricher = {
  id: "docling",
  shouldRun(context) {
    const layout = context.canonical?.diagnostics.layoutConfidence ?? 1;
    const reading = context.canonical?.diagnostics.readingOrderConfidence ?? 1;
    return layout < 0.7 || reading < 0.7;
  },
  async extract() {
    return [];
  },
};
