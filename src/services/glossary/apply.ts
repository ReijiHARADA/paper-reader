import { applyGlossary } from "../llm/glossaryService";
import type { GlossaryEntry } from "../llm/types";
import {
  getBlocksByPaper,
  getGlossary,
  getPaper,
  getSectionsByPaper,
  saveBlocks,
  savePaper,
  saveSections,
} from "../database";
import type { Paper, PaperBlock, Section } from "../../types/paper";

export function assignBlockTranslation(block: PaperBlock, translated: string): void {
  block.translated = translated;
  block.translationStatus = "completed";
  if (block.type === "figure" || block.type === "table") {
    block.metadata = { ...block.metadata, captionTranslated: translated };
  }
}

export async function reapplyGlossary(paperId: string): Promise<{
  paper?: Paper;
  sections: Section[];
  blocks: PaperBlock[];
}> {
  const glossary: GlossaryEntry[] = await getGlossary(paperId);
  const paper = await getPaper(paperId);
  const sections = await getSectionsByPaper(paperId);
  const blocks = await getBlocksByPaper(paperId);
  if (glossary.length === 0) {
    return { paper, sections, blocks };
  }

  if (paper?.titleTranslated) {
    paper.titleTranslated = applyGlossary(paper.titleTranslated, glossary);
    await savePaper(paper);
  }
  for (const section of sections) {
    if (!section.translatedTitle) continue;
    section.translatedTitle = applyGlossary(section.translatedTitle, glossary);
  }
  if (sections.length) await saveSections(sections);
  for (const block of blocks) {
    if (!block.translated) continue;
    assignBlockTranslation(block, applyGlossary(block.translated, glossary));
  }
  if (blocks.some((block) => block.translated)) {
    await saveBlocks(blocks);
  }
  return { paper, sections, blocks };
}
