/**
 * Paper Import Service V2
 * 
 * Uses MADLAD for translation and Ollama for LLM analysis.
 * Implements priority-based translation queue for fast Time to First Read.
 */

import { v4 as uuidv4 } from "uuid";
import { extractPDFContent, computeFileHash, extractFigureImages } from "./pdfService";
import { classifyPdfOpenError } from "./pdfOpenError";
import { isScannedPdf, ocrDocument } from "./ocrService";
import { analyzeStructure } from "./structureService";
import { figureLookupKey } from "./pdfLayout";
import { applyGlossary } from "./llm/glossaryService";
import {
  savePaper,
  saveSections,
  saveBlocks,
  updateBlock,
  getPaperByHash,
  getPaper,
  getBlocksByPaper,
  getSectionsByPaper,
  saveGlossary,
  getGlossary,
  saveBenchmark,
  computeTextHash,
  getCachedTranslation,
  saveTranslationCache,
  type BenchmarkEntry,
} from "./database";
import type { Paper, Section, PaperBlock } from "../types/paper";
import { persistSourcePdf } from "./sourcePdf";
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
  isReferencesHeading,
  looksLikeBibliographyEntry,
  shouldTranslateHeading,
  shouldTranslateParagraph,
  shouldTranslateTitle,
  shouldTranslateCaption,
} from "./translation/quality";
import { OllamaProvider, generateGlossary } from "./llm";
import type { GlossaryEntry } from "./llm/types";
import { resolveMadladServerUrl, MADLAD_MODEL_VERSION } from "./translation/madladEngine";
import { finalizedTranslationStatus } from "./paperStatus";

// ============================================================
// Types
// ============================================================

export type ImportStage =
  | "idle"
  | "reading"
  | "extracting"
  | "structuring"
  | "glossary"
  | "translating"
  | "saving"
  | "completed"
  | "failed";

export type ImportProgress = {
  stage: ImportStage;
  stageProgress: number;
  stageTotal: number;
  message: string;
  paper?: Paper;
  sections?: Section[];
  blocks?: PaperBlock[];
  error?: string;
};

export type ImportCallbacks = {
  onProgress: (progress: ImportProgress) => void;
  onStageChange: (stage: ImportStage) => void;
  onPartialReady: (paper: Paper, sections: Section[], blocks: PaperBlock[]) => void;
  onBlockTranslated?: (block: PaperBlock) => void;
  onPaperUpdated?: (paper: Paper) => void;
  onSectionTranslated?: (section: Section) => void;
};

export type ImportConfig = {
  /** MADLAD server URL */
  madladServerUrl?: string;
  /** Ollama server URL */
  ollamaServerUrl?: string;
  /** Ollama model for LLM tasks */
  ollamaModel?: string;
  /** Whether to generate glossary */
  generateGlossary?: boolean;
  /** Translation concurrency */
  translationConcurrency?: number;
  /** Whether to use translation cache */
  useCache?: boolean;
};

const DEFAULT_CONFIG: Required<ImportConfig> = {
  madladServerUrl: "http://127.0.0.1:8765",
  ollamaServerUrl: "http://localhost:11434",
  ollamaModel: "gemma2:9b",
  generateGlossary: true,
  translationConcurrency: 8,
  useCache: true,
};

const activeImportPaperIds = new Set<string>();
const resumingPapers = new Set<string>();

function usableCachedJa(cached: string | null | undefined, source: string): string | null {
  if (!cached) return null;
  return isPlausibleJaTranslation(cached, source) ? cached : null;
}

function assignBlockTranslation(block: PaperBlock, translated: string): void {
  block.translated = translated;
  block.translationStatus = "completed";
  if (block.type === "figure" || block.type === "table") {
    block.metadata = { ...block.metadata, captionTranslated: translated };
  }
}

function referenceSectionIds(sections: Section[]): Set<string> {
  return new Set(
    sections
      .filter(
        (s) =>
          s.normalizedKind === "references" || isReferencesHeading(s.originalTitle)
      )
      .map((s) => s.id)
  );
}

function shouldTranslateSection(section: Section): boolean {
  if (section.normalizedKind === "references") return false;
  if (isReferencesHeading(section.originalTitle)) return false;
  return shouldTranslateHeading(section.originalTitle);
}

export function shouldTranslateBlock(
  block: PaperBlock,
  refSectionIds: Set<string> = new Set()
): boolean {
  if (!block.original) return false;
  if (block.translationStatus === "skipped") return false;
  if (block.type === "reference") return false;
  if (block.sectionId && refSectionIds.has(block.sectionId)) return false;
  if (isReferencesHeading(block.original)) return false;
  if (looksLikeBibliographyEntry(block.original)) return false;
  const role = String(block.metadata?.role ?? "");
  if (role === "author" || role === "affiliation" || role === "copyright") {
    return false;
  }
  if (block.type === "heading") return false;
  if (block.type === "paragraph" || block.type === "footnote") {
    return shouldTranslateParagraph(block.original);
  }
  if (block.type === "figure" || block.type === "table") {
    const caption = String(block.metadata.captionOriginal ?? block.original ?? "");
    return shouldTranslateCaption(caption);
  }
  return false;
}

export function isRetryableTranslationFailure(
  block: PaperBlock,
  refSectionIds: Set<string> = new Set()
): boolean {
  if (block.type !== "paragraph") return false;
  if (block.translationStatus !== "failed") return false;
  return shouldTranslateBlock(block, refSectionIds);
}

async function persistUntranslatableAsSkipped(
  blocks: PaperBlock[],
  refSectionIds: Set<string>
): Promise<PaperBlock[]> {
  const changed: PaperBlock[] = [];
  for (const block of blocks) {
    if (
      block.translationStatus === "skipped" ||
      block.translationStatus === "completed"
    ) {
      continue;
    }
    if (shouldTranslateBlock(block, refSectionIds)) continue;
    block.translationStatus = "skipped";
    await updateBlock(block);
    changed.push(block);
  }
  return changed;
}

function resolveConfig(config: ImportConfig): Required<ImportConfig> {
  const merged = { ...DEFAULT_CONFIG, ...config };
  merged.madladServerUrl = resolveMadladServerUrl(merged.madladServerUrl);
  if (!merged.ollamaServerUrl?.trim()) {
    merged.ollamaServerUrl = DEFAULT_CONFIG.ollamaServerUrl;
  }
  if (merged.translationConcurrency <= 3) {
    merged.translationConcurrency = 8;
  }
  return merged;
}

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
  const cfg = resolveConfig(config);
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

    // Check for duplicate
    const existingPaper = await getPaperByHash(fileHash);
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

    // Stage 2: Extracting text
    callbacks.onStageChange("extracting");
    const pdfResult = await extractPDFContent(file, (page, total) => {
      callbacks.onProgress({
        stage: "extracting",
        stageProgress: page,
        stageTotal: total,
        message: `テキストを抽出しています... (${page}/${total}ページ)`,
      });
    });

    // スキャン PDF 判定: テキストアイテムが少なければ OCR を実行
    const totalTextItems = pdfResult.pages.reduce(
      (sum, p) => sum + p.textItems.length,
      0
    );
    if (isScannedPdf(totalTextItems, pdfResult.pages.length)) {
      callbacks.onProgress({
        stage: "extracting",
        stageProgress: 0,
        stageTotal: pdfResult.pages.length,
        message: "スキャンPDFを検出しました。OCR処理中...",
      });
      try {
        const { openPdfDocument } = await import("./pdfjsRuntime");
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await openPdfDocument(arrayBuffer).promise;
        const ocrResults = await ocrDocument(pdfDoc, ["en-US", "ja-JP"], (page, total) => {
          callbacks.onProgress({
            stage: "extracting",
            stageProgress: page,
            stageTotal: total,
            message: `OCR処理中... (${page}/${total}ページ)`,
          });
        });
        // OCR 結果を pdfResult のテキストアイテムに上書きマージ
        for (const ocrPage of ocrResults) {
          const pdfPage = pdfResult.pages.find((p) => p.pageNumber === ocrPage.pageNumber);
          if (!pdfPage || ocrPage.lines.length === 0) continue;
          // OCR テキストを疑似テキストアイテムとして追加（y 座標を行番号で割り当て）
          pdfPage.textItems = ocrPage.lines.map((line, idx) => ({
            text: line.text,
            x: 0,
            y: idx * 20,
            width: 500,
            height: 14,
            fontSize: 12,
            fontName: "ocr",
            page: ocrPage.pageNumber,
          }));
        }
      } catch (ocrErr) {
        console.warn("OCR failed, proceeding with empty text:", ocrErr);
      }
    }

    // Stage 3: Analyzing structure
    callbacks.onStageChange("structuring");
    callbacks.onProgress({
      stage: "structuring",
      stageProgress: 0,
      stageTotal: 1,
      message: "論文の構造を解析しています...",
    });

    const { paper, sections, blocks, layoutBlocks, layouts } = analyzeStructure(
      pdfResult.pages,
      paperId,
      file.name,
      fileHash,
      pdfResult.metadata
    );
    paper.sourceFileName = file.name;
    try {
      paper.sourceStoredPath = await persistSourcePdf(paperId, file);
    } catch (e) {
      console.warn("Failed to persist source PDF copy:", e);
      paper.sourceStoredPath = null;
    }

    callbacks.onProgress({
      stage: "structuring",
      stageProgress: 0,
      stageTotal: 1,
      message: "図を抽出しています...",
    });
    try {
      const figureImages = await extractFigureImages(
        file,
        layoutBlocks,
        layouts,
        (done, total) => {
          callbacks.onProgress({
            stage: "structuring",
            stageProgress: done,
            stageTotal: total,
            message: `図を抽出しています... (${done}/${total})`,
          });
        }
      );
      for (const block of blocks) {
        if (block.type !== "figure" && block.type !== "table") continue;
        const caption = String(block.metadata.captionOriginal ?? "");
        const key =
          String(block.metadata.figureKey ?? "") ||
          figureLookupKey(caption, block.pageStart);
        const imageUrl = figureImages.get(key);
        if (imageUrl) {
          block.metadata = { ...block.metadata, imageUrl };
        }
      }
      console.info(`[figures] extracted ${figureImages.size} images`);
    } catch (error) {
      console.warn("[figures] extraction failed", error);
    }

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

    // Notify that partial data is ready (can start viewing)
    callbacks.onPartialReady(paper, sections, blocks);

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
          if (paper.titleTranslated) {
            paper.titleTranslated = applyGlossary(paper.titleTranslated, glossary);
            await savePaper(paper);
            callbacks.onPaperUpdated?.(paper);
          }
          for (const section of sections) {
            if (!section.translatedTitle) continue;
            section.translatedTitle = applyGlossary(section.translatedTitle, glossary);
          }
          await saveSections(sections);
          for (const block of blocks) {
            if (!block.translated) continue;
            assignBlockTranslation(block, applyGlossary(block.translated, glossary));
            await updateBlock(block);
            callbacks.onBlockTranslated?.(block);
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
      shouldTranslateBlock(block, refSectionIds)
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
 * Resume translation for a paper that was left pending (server crash, reload, etc).
 */
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
    const skipped = await persistUntranslatableAsSkipped(blocks, refSectionIds);
    for (const block of skipped) {
      callbacks.onBlockTranslated?.(block);
    }
    const pendingBlocks = blocks.filter(
      (b) =>
        shouldTranslateBlock(b, refSectionIds) &&
        b.translationStatus !== "failed" &&
        (!b.translated || !isPlausibleJaTranslation(b.translated, b.original || ""))
    );
    const pendingTitle = Boolean(
      paper.titleOriginal &&
        shouldTranslateTitle(paper.titleOriginal) &&
        (!paper.titleTranslated ||
          !titleTranslationComplete(paper.titleOriginal, paper.titleTranslated))
    );
    const pendingSections = sections.filter(
      (s) =>
        s.originalTitle &&
        shouldTranslateSection(s) &&
        (!s.translatedTitle ||
          !isPlausibleJaTranslation(s.translatedTitle, s.originalTitle))
    );

    if (!pendingBlocks.length && !pendingTitle && pendingSections.length === 0) {
      const nextStatus = finalizedTranslationStatus(blocks, (block) =>
        shouldTranslateBlock(block, refSectionIds)
      );
      if (paper.processingStatus !== nextStatus) {
        paper.processingStatus = nextStatus;
        await savePaper(paper);
        callbacks.onPaperUpdated?.(paper);
      }
      return;
    }

    const cfg = resolveConfig(config);
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
        const block = blocks.find((b) => b.id === task.blockId);
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
      markDone();
    });

    queue.setOnTaskFailed((task) => {
      const block = blocks.find((b) => b.id === task.blockId);
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
      shouldTranslateBlock(block, refSectionIds)
    );
    paper.updatedAt = new Date().toISOString();
    await savePaper(paper);
    callbacks.onPaperUpdated?.(paper);
  } finally {
    translationManager.detach(paperId);
    resumingPapers.delete(paperId);
  }
}

/**
 * Check if MADLAD server is available.
 */
export async function checkMADLADAvailability(
  serverUrl: string = DEFAULT_CONFIG.madladServerUrl
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
