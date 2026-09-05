import type { Paper, PaperBlock, Section } from "../../types/paper";
import { saveBlocks, savePaper, saveSections } from "../database";
import { isJapaneseSourcePaper } from "../sourceLanguage";
import { isPlausibleJaTranslation } from "../translation/quality";
import { resolveMadladServerUrl } from "../translation/madladEngine";
import { shouldTranslateBlock } from "./policy";
import type { ImportConfig } from "./types";

export const DEFAULT_IMPORT_CONFIG: Required<ImportConfig> = {
  madladServerUrl: "http://127.0.0.1:8765",
  ollamaServerUrl: "http://localhost:11434",
  ollamaModel: "gemma2:9b",
  generateGlossary: true,
  translationConcurrency: 8,
  useCache: true,
};

export function usableCachedJa(cached: string | null | undefined, source: string): string | null {
  if (!cached) return null;
  return isPlausibleJaTranslation(cached, source) ? cached : null;
}

export async function persistUntranslatableAsSkipped(
  blocks: PaperBlock[],
  refSectionIds: Set<string>
): Promise<PaperBlock[]> {
  const changed: PaperBlock[] = [];
  for (const block of blocks) {
    if (block.translationStatus === "skipped" || block.translationStatus === "completed") {
      continue;
    }
    if (shouldTranslateBlock(block, refSectionIds)) continue;
    block.translationStatus = "skipped";
    changed.push(block);
  }
  if (changed.length > 0) {
    await saveBlocks(blocks);
  }
  return changed;
}

export function isJapaneseLayoutOnlyPaper(
  title: string | null,
  blocks: PaperBlock[]
): boolean {
  return isJapaneseSourcePaper({
    title,
    paragraphs: blocks
      .filter((block) => block.type === "paragraph")
      .map((block) => block.original),
  });
}

export async function finalizeJapaneseLayoutOnly(
  paper: Paper,
  sections: Section[],
  blocks: PaperBlock[]
): Promise<void> {
  for (const block of blocks) {
    if (block.translationStatus === "completed") continue;
    block.translationStatus = "skipped";
  }
  paper.processingStatus = "ready";
  paper.updatedAt = new Date().toISOString();
  await saveBlocks(blocks);
  await saveSections(sections);
  await savePaper(paper);
}

export function resolveImportConfig(config: ImportConfig): Required<ImportConfig> {
  const merged = { ...DEFAULT_IMPORT_CONFIG, ...config };
  merged.madladServerUrl = resolveMadladServerUrl(merged.madladServerUrl);
  if (!merged.ollamaServerUrl?.trim()) {
    merged.ollamaServerUrl = DEFAULT_IMPORT_CONFIG.ollamaServerUrl;
  }
  if (merged.translationConcurrency <= 3) {
    merged.translationConcurrency = 8;
  }
  return merged;
}
