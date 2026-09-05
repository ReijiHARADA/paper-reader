import {
  getBlocksByPaper,
  getGlossary,
  getPaper,
  getSectionsByPaper,
  savePaper,
  saveSections,
  updateBlock,
} from "../database";
import { assignBlockTranslation } from "../glossary/apply";
import { applyGlossary } from "../llm/glossaryService";
import { finalizedTranslationStatus } from "../paperStatus";
import {
  MADLADEngine,
  TranslationPriority,
  translationManager,
  TranslationQueue,
  type TranslationPriorityValue,
} from "../translation";
import { isPlausibleJaTranslation, shouldTranslateTitle, titleTranslationComplete } from "../translation/quality";
import {
  finalizeJapaneseLayoutOnly,
  isJapaneseLayoutOnlyPaper,
  persistUntranslatableAsSkipped,
  resolveImportConfig,
} from "./helpers";
import { isRetryableTranslationFailure, referenceSectionIds, shouldTranslateBlock, shouldTranslateSection } from "./policy";
import { activeImportPaperIds, resumingPapers } from "./session";
import type { ImportCallbacks, ImportConfig } from "./types";

export async function resumeIncompleteTranslation(
  paperId: string,
  callbacks: Pick<
    ImportCallbacks,
    "onBlockTranslated" | "onPaperUpdated" | "onSectionTranslated"
  > = {},
  config: ImportConfig = {}
): Promise<void> {
  if (activeImportPaperIds.has(paperId) || resumingPapers.has(paperId)) return;
  resumingPapers.add(paperId);

  try {
    const paper = await getPaper(paperId);
    if (!paper) return;

    const blocks = await getBlocksByPaper(paperId);
    const sections = await getSectionsByPaper(paperId);
    const refSectionIds = referenceSectionIds(sections);

    if (isJapaneseLayoutOnlyPaper(paper.titleOriginal, blocks)) {
      await finalizeJapaneseLayoutOnly(paper, sections, blocks);
      callbacks.onPaperUpdated?.(paper);
      for (const block of blocks) {
        callbacks.onBlockTranslated?.(block);
      }
      return;
    }

    const skipped = await persistUntranslatableAsSkipped(blocks, refSectionIds);
    for (const block of skipped) {
      callbacks.onBlockTranslated?.(block);
    }
    const pendingBlocks = blocks.filter(
      (block) =>
        shouldTranslateBlock(block, refSectionIds) &&
        block.translationStatus !== "failed" &&
        (!block.translated || !isPlausibleJaTranslation(block.translated, block.original || ""))
    );
    const pendingTitle = Boolean(
      paper.titleOriginal &&
        shouldTranslateTitle(paper.titleOriginal) &&
        (!paper.titleTranslated ||
          !titleTranslationComplete(paper.titleOriginal, paper.titleTranslated))
    );
    const pendingSections = sections.filter(
      (section) =>
        section.originalTitle &&
        shouldTranslateSection(section) &&
        (!section.translatedTitle ||
          !isPlausibleJaTranslation(section.translatedTitle, section.originalTitle))
    );

    if (!pendingBlocks.length && !pendingTitle && pendingSections.length === 0) {
      const nextStatus = finalizedTranslationStatus(blocks, (block) =>
        isRetryableTranslationFailure(block, refSectionIds)
      );
      if (paper.processingStatus !== nextStatus) {
        paper.processingStatus = nextStatus;
        await savePaper(paper);
        callbacks.onPaperUpdated?.(paper);
      }
      return;
    }

    const cfg = resolveImportConfig(config);
    const translationEngine = new MADLADEngine(cfg.madladServerUrl);
    const queue = new TranslationQueue(translationEngine, {
      concurrency: 8,
      retryFailed: false,
    });
    queue.start();
    translationManager.attach(paperId, queue);

    paper.processingStatus = "translating";
    await savePaper(paper);
    callbacks.onPaperUpdated?.(paper);

    const glossaryEntries = await getGlossary(paperId);

    let outstanding = 0;
    let settleAll: () => void = () => {};
    const allDone = new Promise<void>((resolve) => {
      settleAll = resolve;
    });
    const markDone = () => {
      outstanding = Math.max(0, outstanding - 1);
      if (outstanding === 0) settleAll();
    };

    queue.setOnTaskCompleted(async (task) => {
      if (!task.result) {
        markDone();
        return;
      }
      const translated = applyGlossary(task.result.text, glossaryEntries);
      if (!isPlausibleJaTranslation(translated, task.text)) {
        const block = blocks.find((item) => item.id === task.blockId);
        if (block) {
          block.translationStatus = "failed";
          void updateBlock(block);
          callbacks.onBlockTranslated?.(block);
        }
        markDone();
        return;
      }
      if (task.blockId === `title-${paperId}`) {
        paper.titleTranslated = translated;
        await savePaper(paper);
        callbacks.onPaperUpdated?.(paper);
      } else if (task.blockId.startsWith("section-")) {
        const sectionId = task.blockId.slice("section-".length);
        const section = sections.find((item) => item.id === sectionId);
        if (section) {
          section.translatedTitle = translated;
          await saveSections(sections);
          callbacks.onSectionTranslated?.(section);
        }
      } else {
        const block = blocks.find((item) => item.id === task.blockId);
        if (block) {
          assignBlockTranslation(block, translated);
          await updateBlock(block);
          callbacks.onBlockTranslated?.(block);
        }
      }
      markDone();
    });

    queue.setOnTaskFailed((task) => {
      const block = blocks.find((item) => item.id === task.blockId);
      if (block) {
        block.translationStatus = "failed";
        void updateBlock(block);
        callbacks.onBlockTranslated?.(block);
      }
      markDone();
    });

    const enqueue = (
      blockId: string,
      text: string,
      priority: TranslationPriorityValue
    ) => {
      outstanding += 1;
      queue.enqueue(paperId, blockId, text, priority, "en", "ja");
    };

    if (pendingTitle && paper.titleOriginal) {
      enqueue(`title-${paperId}`, paper.titleOriginal, TranslationPriority.CRITICAL);
    }
    for (const section of pendingSections) {
      enqueue(`section-${section.id}`, section.originalTitle, TranslationPriority.HIGH);
    }
    for (const block of pendingBlocks) {
      enqueue(block.id, block.original!, TranslationPriority.MEDIUM);
    }

    if (outstanding === 0) settleAll();
    await allDone;

    paper.processingStatus = finalizedTranslationStatus(blocks, (block) =>
      isRetryableTranslationFailure(block, refSectionIds)
    );
    paper.updatedAt = new Date().toISOString();
    await savePaper(paper);
    callbacks.onPaperUpdated?.(paper);
  } finally {
    translationManager.detach(paperId);
    resumingPapers.delete(paperId);
  }
}
