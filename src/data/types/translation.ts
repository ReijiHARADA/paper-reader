import type { TranslationStatus } from "../../types/paper";

export type TranslationBlockState = {
  status: TranslationStatus;
  model?: string;
};

export type TranslationFile = {
  schemaVersion: number;
  targetLanguage: string;
  blocks: Record<string, TranslationBlockState>;
};
