/**
 * Paper Import Service V2
 * 
 * Uses MADLAD for translation and Ollama for LLM analysis.
 * Implements priority-based translation queue for fast Time to First Read.
 */

import { v4 as uuidv4 } from "uuid";
import { computeFileHash } from "./pdfService";
import { classifyPdfOpenError } from "./pdfOpenError";
import { extractAcademicPdf } from "./pdfExtraction/pipeline/extractAcademicPdf";
import { applyGlossary } from "./llm/glossaryService";
import { assignBlockTranslation, reapplyGlossary } from "./glossary/apply";
import {
  savePaper,
  saveSections,
  saveBlocks,
  updateBlock,
  getBlocksByPaper,
  saveGlossary,
  getGlossary,
  saveBenchmark,
  computeTextHash,
  getCachedTranslation,
  saveTranslationCache,
  type BenchmarkEntry,
} from "./database";
import type { Paper, Section, PaperBlock } from "../types/paper";
import { rememberSourcePdf } from "../data/repositories/documentRepository";
import {
  MADLADEngine,
  TranslationQueue,
  TranslationPriority,
  translationManager,
  type TranslationPriorityValue,
} from "./translation";
import {
  isPlausibleJaTranslation,
  titleTranslationComplete,
  shouldTranslateTitle,
} from "./translation/quality";
import { OllamaProvider, generateGlossary } from "./llm";
import type { GlossaryEntry } from "./llm/types";
import { resolveMadladServerUrl, MADLAD_MODEL_VERSION } from "./translation/madladEngine";
import { finalizedTranslationStatus } from "./paperStatus";
import {
  isRetryableTranslationFailure,
  referenceSectionIds,
  shouldTranslateBlock,
  shouldTranslateSection,
} from "./import/policy";
import {
  DEFAULT_IMPORT_CONFIG,
  finalizeJapaneseLayoutOnly,
  isJapaneseLayoutOnlyPaper,
  persistUntranslatableAsSkipped,
  resolveImportConfig,
  usableCachedJa,
} from "./import/helpers";
import { activeImportPaperIds } from "./import/session";
import type { ImportCallbacks, ImportConfig } from "./import/types";

export {
  isRetryableTranslationFailure,
  shouldTranslateBlock,
} from "./import/policy";

export type {
  ImportCallbacks,
  ImportConfig,
  ImportProgress,
  ImportStage,
} from "./import/types";
export { resumeIncompleteTranslation } from "./import/resume";

// ============================================================
// Import Service
// ============================================================

/**
 * Import a PDF with MADLAD translation and Ollama analysis.
 */
export async function importPDFV2(
  file: File,
  callbacks: ImportCallbacks,
  config: ImportConfig = {}
): Promise<{ paper: Paper; sections: Section[]; blocks: PaperBlock[] } | null> {
  const cfg = resolveImportConfig(config);
  const paperId = uuidv4();
  activeImportPaperIds.add(paperId);

  const translationEngine = new MADLADEngine(cfg.madladServerUrl);
  const llmProvider = new OllamaProvider(cfg.ollamaServerUrl, cfg.ollamaModel);

  try {
    // Stage 1: Reading file
    callbacks.onStageChange("reading");
    callbacks.onProgress({
      stage: "reading",
      stageProgress: 0,
      stageTotal: 1,
      message: "PDFファイルを読み込んでいます...",
    });

    const fileHash = await computeFileHash(file);

    const { findDuplicatePaper } = await import("./import/duplicate");
    const existingPaper = await findDuplicatePaper(fileHash);
    if (existingPaper) {
      callbacks.onProgress({
        stage: "completed",
        stageProgress: 1,
        stageTotal: 1,
        message: "このPDFは既にインポートされています",
        paper: existingPaper,
      });
      return null;
    }

    // Stage 2–3: native extract, classify, resolve Canonical, project, figures
    callbacks.onStageChange("extracting");
    const previousBlocks = await getBlocksByPaper(paperId);
    const extracted = await extractAcademicPdf({
      paperId,
      filePath: file.name,
      fileHash,
      file,
      extractFigures: true,
      previousBlocks: previousBlocks.length ? previousBlocks : undefined,
      onProgress: (progress) => {
        const stage =
          progress.stage === "figures" || progress.stage === "structuring"
            ? "structuring"
            : "extracting";
        if (progress.stage === "figures" || progress.stage === "structuring") {
          callbacks.onStageChange("structuring");
        }
        callbacks.onProgress({
          stage,
          stageProgress: progress.done,
          stageTotal: progress.total,
          message: progress.message,
        });
      },
    });

    const { paper, sections, blocks: extractedBlocks } = extracted;
    const { attachLinesToBlocks, layoutFileFromNative } = await import("../data/package/layoutFromExtraction");
    const blocks = attachLinesToBlocks(extractedBlocks, extracted.layoutBlocks);
    paper.sourceFileName = file.name;
    const sourcePdf = new Uint8Array(await file.arrayBuffer());
    rememberSourcePdf(paperId, sourcePdf);
    paper.sourceStoredPath = `papers/${paperId}/source.pdf`;

    const preview = blocks
      .filter((b) => b.pageStart === 3 && (b.original || (b.metadata as { captionOriginal?: string }).captionOriginal))
      .slice(0, 12)
      .map((b) => {
        const caption = (b.metadata as { captionOriginal?: string }).captionOriginal;
        return `p${b.pageStart} [${b.type}/${String(b.metadata.column ?? "")}] ${(b.original || caption || "").slice(0, 140)}`;
      });
    console.info("[reading-order] page 3 preview\n" + preview.join("\n"));

    // Save initial structure
    paper.processingStatus = "glossary";
    await savePaper(paper);
    await saveSections(sections);
    await saveBlocks(blocks);
    try {
      const { getStorage } = await import("../data/runtime");
      const { loadPaperPackage, persistPaperPackage } = await import("../data/package/persist");
      const { fs } = await getStorage();
      const pkg = await loadPaperPackage(fs, paperId);
      pkg.layout = layoutFileFromNative(extracted.native, blocks);
      await persistPaperPackage(fs, pkg);
    } catch (error) {
      console.warn("Failed to persist layout provenance:", error);
    }

    // Notify that partial data is ready (can start viewing)
    callbacks.onPartialReady(paper, sections, blocks);

    if (isJapaneseLayoutOnlyPaper(paper.titleOriginal, blocks)) {
      await finalizeJapaneseLayoutOnly(paper, sections, blocks);
      callbacks.onPaperUpdated?.(paper);
      for (const block of blocks) {
        callbacks.onBlockTranslated?.(block);
      }
      callbacks.onStageChange("completed");
      callbacks.onProgress({
        stage: "completed",
        stageProgress: 1,
        stageTotal: 1,
        message: "日本語論文のため翻訳をスキップし、レイアウトのみ作成しました",
        paper,
        sections,
        blocks,
      });
      return { paper, sections, blocks };
    }

    let glossaryEntries: GlossaryEntry[] = await getGlossary(paperId);

    // Stage 4: Glossary in the background — never block translation
    if (cfg.generateGlossary) {
      void (async () => {
        try {
          callbacks.onStageChange("glossary");
          callbacks.onProgress({
            stage: "glossary",
            stageProgress: 0,
            stageTotal: 1,
            message: "用語集を生成しています...",
          });

          const abstractSection = sections.find(
            (s) => s.normalizedKind === "abstract"
          );
          const abstractBlocks = blocks.filter(
            (b) => b.sectionId === abstractSection?.id && b.type === "paragraph"
          );
          const abstractText = abstractBlocks
            .map((b) => b.original)
            .filter(Boolean)
            .join(" ");

          const glossary = await generateGlossary(
            llmProvider,
            paper.titleOriginal || "",
            abstractText,
            []
          );
          await saveGlossary(paperId, glossary);
          glossaryEntries = glossary;
          const updated = await reapplyGlossary(paperId);
          if (updated.paper) {
            Object.assign(paper, updated.paper);
            callbacks.onPaperUpdated?.(updated.paper);
          }
          for (const section of updated.sections) {
            const local = sections.find((item) => item.id === section.id);
            if (local) Object.assign(local, section);
            callbacks.onSectionTranslated?.(section);
          }
          for (const block of updated.blocks) {
            const local = blocks.find((item) => item.id === block.id);
            if (local) Object.assign(local, block);
            if (block.translated) callbacks.onBlockTranslated?.(block);
          }
        } catch (e) {
          console.error("Failed to generate glossary:", e);
        }
      })();
    }

    // Stage 5: Translation with priority queue
    callbacks.onStageChange("translating");
    paper.processingStatus = "translating";
    await savePaper(paper);

    const translationQueue = new TranslationQueue(translationEngine, {
      concurrency: cfg.translationConcurrency,
      retryFailed: false,
      maxRetries: 0,
      retryDelayMs: 1000,
    });
    translationQueue.start();
    translationManager.attach(paperId, translationQueue);

    // Track translation progress
    let translatedCount = 0;
    const refSectionIds = referenceSectionIds(sections);
    const totalTranslatable =
      blocks.filter((b) => shouldTranslateBlock(b, refSectionIds)).length +
      sections.filter(shouldTranslateSection).length +
      (paper.titleOriginal && shouldTranslateTitle(paper.titleOriginal) ? 1 : 0);

    const updateProgress = () => {
      callbacks.onProgress({
        stage: "translating",
        stageProgress: translatedCount,
        stageTotal: totalTranslatable,
        message: `翻訳中... (${translatedCount}/${totalTranslatable})`,
        paper,
        sections,
        blocks,
      });
    };

    let outstanding = 0;
    let settleAll: () => void = () => {};
    const allDone = new Promise<void>((resolve) => {
      settleAll = resolve;
    });
    const markDone = () => {
      outstanding = Math.max(0, outstanding - 1);
      if (outstanding === 0) {
        settleAll();
      }
    };

    translationQueue.setOnTaskCompleted(async (task) => {
      if (!task.result) {
        markDone();
        return;
      }

      const translated = applyGlossary(task.result.text, glossaryEntries);
      if (!isPlausibleJaTranslation(translated, task.text)) {
        console.warn(
          `[translation] rejected degenerate output for ${task.blockId}:`,
          translated.slice(0, 80)
        );
        const block = blocks.find((b) => b.id === task.blockId);
        if (block) {
          block.translationStatus = "failed";
          await updateBlock(block);
          callbacks.onBlockTranslated?.(block);
        }
        translatedCount++;
        updateProgress();
        markDone();
        return;
      }

      if (task.blockId === `title-${paperId}`) {
        paper.titleTranslated = translated;
        await savePaper(paper);
        callbacks.onPaperUpdated?.(paper);
      } else if (task.blockId.startsWith("section-")) {
        const sectionId = task.blockId.slice("section-".length);
        const section = sections.find((s) => s.id === sectionId);
        if (section) {
          section.translatedTitle = translated;
          await saveSections(sections);
          callbacks.onSectionTranslated?.(section);
        }
      } else {
        const block = blocks.find((b) => b.id === task.blockId);
        if (block) {
          assignBlockTranslation(block, translated);
          await updateBlock(block);
          callbacks.onBlockTranslated?.(block);
        }
      }

      if (cfg.useCache && task.text) {
        const textHash = await computeTextHash(task.text);
        await saveTranslationCache(textHash, {
          sourceLanguage: "en",
          targetLanguage: "ja",
          model: task.result.model,
          modelVersion: task.result.modelVersion,
          translatedText: translated,
        });
      }

      const benchmarkEntry: BenchmarkEntry = {
        id: uuidv4(),
        paperId,
        model: task.result.model,
        modelVersion: task.result.modelVersion,
        inputChars: task.result.inputChars,
        inputTokens: task.result.inputTokens ?? null,
        outputChars: task.result.outputChars,
        translationTimeMs: task.result.translationTimeMs,
        charsPerSec: task.result.charsPerSec,
        tokensPerSec: task.result.tokensPerSec ?? null,
        timestamp: new Date().toISOString(),
      };
      await saveBenchmark(benchmarkEntry);

      translatedCount++;
      updateProgress();
      markDone();
    });

    translationQueue.setOnTaskFailed((task) => {
      console.error(`Translation failed for block ${task.blockId}:`, task.error);
      const block = blocks.find((b) => b.id === task.blockId);
      if (block) {
        block.translationStatus = "failed";
        void updateBlock(block);
        callbacks.onBlockTranslated?.(block);
      }
      translatedCount++;
      updateProgress();
      markDone();
    });

    const enqueue = (
      blockId: string,
      text: string,
      priority: TranslationPriorityValue
    ) => {
      outstanding += 1;
      translationQueue.enqueue(paperId, blockId, text, priority, "en", "ja");
    };

    // Queue title first (highest priority)
    if (paper.titleOriginal && shouldTranslateTitle(paper.titleOriginal)) {
      const titleHash = await computeTextHash(paper.titleOriginal);
      const cachedTitle = cfg.useCache
        ? usableCachedJa(
            await getCachedTranslation(
              titleHash,
              translationEngine.name,
              MADLAD_MODEL_VERSION,
              "en",
              "ja"
            ),
            paper.titleOriginal
          )
        : null;

      if (cachedTitle && titleTranslationComplete(paper.titleOriginal, cachedTitle)) {
        paper.titleTranslated = cachedTitle;
        callbacks.onPaperUpdated?.(paper);
        translatedCount++;
      } else {
        enqueue(`title-${paperId}`, paper.titleOriginal, TranslationPriority.CRITICAL);
      }
    }

    // Queue section titles (high priority)
    for (const section of sections) {
      const sectionHash = await computeTextHash(section.originalTitle);
      const cachedSection = cfg.useCache
        ? usableCachedJa(
            await getCachedTranslation(
              sectionHash,
              translationEngine.name,
              MADLAD_MODEL_VERSION,
              "en",
              "ja"
            ),
            section.originalTitle
          )
        : null;

      if (cachedSection && shouldTranslateSection(section)) {
        section.translatedTitle = cachedSection;
        callbacks.onSectionTranslated?.(section);
        translatedCount++;
      } else if (shouldTranslateSection(section)) {
        enqueue(`section-${section.id}`, section.originalTitle, TranslationPriority.HIGH);
      }
    }

    // Queue blocks by priority
    const abstractSection = sections.find((s) => s.normalizedKind === "abstract");
    const introSection = sections.find((s) => s.normalizedKind === "introduction");

    await persistUntranslatableAsSkipped(blocks, refSectionIds);

    for (const block of blocks) {
      if (!shouldTranslateBlock(block, refSectionIds) || !block.original) {
        continue;
      }

      const blockHash = await computeTextHash(block.original);
      const cachedBlock = cfg.useCache
        ? usableCachedJa(
            await getCachedTranslation(
              blockHash,
              translationEngine.name,
              MADLAD_MODEL_VERSION,
              "en",
              "ja"
            ),
            block.original
          )
        : null;

      if (cachedBlock) {
        assignBlockTranslation(block, applyGlossary(cachedBlock, glossaryEntries));
        await updateBlock(block);
        callbacks.onBlockTranslated?.(block);
        translatedCount++;
        continue;
      }

      let priority: TranslationPriorityValue = TranslationPriority.LOW;
      if (block.sectionId === abstractSection?.id) {
        priority = TranslationPriority.CRITICAL;
      } else if (block.sectionId === introSection?.id) {
        priority = TranslationPriority.HIGH;
      }

      enqueue(block.id, block.original, priority);
    }

    if (outstanding === 0) {
      settleAll();
    }
    await allDone;

    // Stage 6: Finalize
    callbacks.onStageChange("saving");
    callbacks.onProgress({
      stage: "saving",
      stageProgress: 0,
      stageTotal: 1,
      message: "保存しています...",
    });

    // Update section translations
    await saveSections(sections);

    paper.processingStatus = finalizedTranslationStatus(blocks, (block) =>
      isRetryableTranslationFailure(block, refSectionIds)
    );
    paper.updatedAt = new Date().toISOString();
    await savePaper(paper);

    callbacks.onStageChange("completed");
    callbacks.onProgress({
      stage: "completed",
      stageProgress: 1,
      stageTotal: 1,
      message: "インポートが完了しました",
      paper,
      sections,
      blocks,
    });

    return { paper, sections, blocks };

  } catch (error) {
    const classified = classifyPdfOpenError(error);
    const message =
      classified.code !== "unknown"
        ? classified.message
        : error instanceof Error
          ? error.message
          : "不明なエラー";
    callbacks.onStageChange("failed");
    callbacks.onProgress({
      stage: "failed",
      stageProgress: 0,
      stageTotal: 1,
      message: `エラー: ${message}`,
      error: message,
    });
    return null;
  } finally {
    translationManager.detach(paperId);
    activeImportPaperIds.delete(paperId);
  }
}

/**
 * Check if MADLAD server is available.
 */
export async function checkMADLADAvailability(
  serverUrl: string = DEFAULT_IMPORT_CONFIG.madladServerUrl
): Promise<{ available: boolean; modelLoaded: boolean; error?: string }> {
  const resolved = resolveMadladServerUrl(serverUrl);
  try {
    const response = await fetch(`${resolved}/health`);
    if (!response.ok) {
      return {
        available: false,
        modelLoaded: false,
        error: `Server returned ${response.status}`,
      };
    }
    const data = await response.json();
    return {
      available: true,
      modelLoaded: data.model_loaded,
    };
  } catch {
    return {
      available: false,
      modelLoaded: false,
      error: "翻訳サーバーに接続できません。サーバーを起動してください。",
    };
  }
}
