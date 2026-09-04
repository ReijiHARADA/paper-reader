export type TranslationSettingsV2 = {
  madladServerUrl: string;
  ollamaServerUrl: string;
  ollamaModel: string;
  generateGlossary: boolean;
  translationConcurrency: number;
  useCache: boolean;
};

export const DEFAULT_TRANSLATION_SETTINGS_V2: TranslationSettingsV2 = {
  madladServerUrl: "http://127.0.0.1:8765",
  ollamaServerUrl: "http://localhost:11434",
  ollamaModel: "gemma2:9b",
  generateGlossary: true,
  translationConcurrency: 8,
  useCache: true,
};

export function mergeTranslationSettingsV2(
  saved: Partial<TranslationSettingsV2> | null | undefined
): TranslationSettingsV2 {
  const merged = { ...DEFAULT_TRANSLATION_SETTINGS_V2, ...saved };
  const previous = saved?.translationConcurrency ?? 1;
  if (previous <= 3) {
    merged.translationConcurrency = 8;
  }
  return merged;
}
