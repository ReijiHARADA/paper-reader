import { describe, expect, it } from "vitest";
import {
  SETTINGS_SECTIONS,
  settingsSectionElementId,
} from "../utils/settingsToc";
import {
  DEFAULT_TRANSLATION_SETTINGS_V2,
  mergeTranslationSettingsV2,
} from "../utils/translationSettings";

describe("settings TOC", () => {
  it("lists the five settings sections in navigation order", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.label)).toEqual([
      "一般",
      "翻訳",
      "読書",
      "ストレージ",
      "診断",
    ]);
    expect(settingsSectionElementId("reading")).toBe("section-reading");
  });
});

describe("mergeTranslationSettingsV2", () => {
  it("keeps default concurrency 8 and existing URLs", () => {
    const merged = mergeTranslationSettingsV2({
      madladServerUrl: "http://127.0.0.1:9000",
      ollamaModel: "gemma2:9b",
      generateGlossary: false,
      translationConcurrency: 8,
      useCache: false,
    });
    expect(merged.madladServerUrl).toBe("http://127.0.0.1:9000");
    expect(merged.generateGlossary).toBe(false);
    expect(merged.useCache).toBe(false);
    expect(merged.translationConcurrency).toBe(8);
    expect(merged.ollamaServerUrl).toBe(
      DEFAULT_TRANSLATION_SETTINGS_V2.ollamaServerUrl
    );
  });

  it("bumps legacy concurrency of 3 or less up to 8", () => {
    expect(mergeTranslationSettingsV2({ translationConcurrency: 1 }).translationConcurrency).toBe(8);
    expect(mergeTranslationSettingsV2({ translationConcurrency: 3 }).translationConcurrency).toBe(8);
    expect(mergeTranslationSettingsV2({ translationConcurrency: 4 }).translationConcurrency).toBe(4);
  });
});
