import type { ExtractedPage } from "../../pdfService";
import type { CanonicalDocument } from "../canonical/types";
import type { NativeDocument } from "../native/types";
import type { ExtractionEvidence } from "../types";

export type ExtractionContext = {
  native: NativeDocument;
  pages: ExtractedPage[];
  pdfBytes?: Uint8Array;
  canonical?: CanonicalDocument;
};

export type ExtractionEnricher = {
  id: string;
  shouldRun(context: ExtractionContext): boolean;
  extract(context: ExtractionContext): Promise<ExtractionEvidence[]>;
};
