import { describe, expect, it } from "vitest";
import {
  isPlausibleJaTranslation,
  shouldTranslateTitle,
} from "../services/translation/quality";

describe("isPlausibleJaTranslation", () => {
  const source =
    "This research was supported by STW VIDI grant number 016.128.303 Research (NWO), awarded to Elise van den Hoven.";

  it("keeps a Japanese translation that retains grant identifiers from the source", () => {
    expect(
      isPlausibleJaTranslation(
        "本研究は STW VIDI grant number 016.128.303 によって支援され、Elise van den Hoven に授与された。",
        source
      )
    ).toBe(true);
  });

  it("rejects an English echo of the source", () => {
    expect(isPlausibleJaTranslation(source, source)).toBe(false);
  });
});

describe("shouldTranslateTitle", () => {
  it("does not send a dotted grant identifier as a paper title", () => {
    expect(shouldTranslateTitle("016.128.303")).toBe(false);
  });
});
