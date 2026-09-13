import { describe, expect, it } from "vitest";
import { detectPartialSourceFallback } from "../../scripts/benchmark-real-paper-translation";

describe("translation audit partial source fallback detection", () => {
  it("flags a long source sentence left untranslated inside accepted Japanese", () => {
    const source = "The system uses two wearable prototypes to evaluate social acceptability in public settings. Participants then rated each condition on a seven-point scale.";
    const translation = "このシステムは公共空間での社会的受容性を評価します。 Participants then rated each condition on a seven-point scale.";

    expect(detectPartialSourceFallback(source, translation)).toMatchObject({ partial: true });
  });

  it("does not flag short preserved acronyms or citations", () => {
    const source = "We compared the IR camera condition with the baseline condition [12].";
    const translation = "IR カメラ条件をベースライン条件 [12] と比較した。";

    expect(detectPartialSourceFallback(source, translation)).toEqual({ partial: false });
  });
});
