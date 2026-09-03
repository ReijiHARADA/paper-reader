import { v4 as uuidv4 } from "uuid";
import { extractPDFContent, computeFileHash } from "./pdfService";
import { analyzeStructure } from "./structureService";
import {
  translateBlocks,
  translateSectionTitles,
  translateTitle,
  type TranslationConfig,
} from "./translationService";
import {
  savePaper,
  saveSections,
  saveBlocks,
  updateBlock,
  getPaperByHash,
} from "./database";
import type { Paper, Section, PaperBlock } from "../types/paper";

export type ImportStage =
  | "idle"
  | "reading"
  | "extracting"
  | "structuring"
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
};

export async function importPDF(
  file: File,
  translationConfig: TranslationConfig,
  callbacks: ImportCallbacks
): Promise<{ paper: Paper; sections: Section[]; blocks: PaperBlock[] } | null> {
  const paperId = uuidv4();

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

    // Stage 3: Analyzing structure
    callbacks.onStageChange("structuring");
    callbacks.onProgress({
      stage: "structuring",
      stageProgress: 0,
      stageTotal: 1,
      message: "論文の構造を解析しています...",
    });

    const { paper, sections, blocks } = analyzeStructure(
      pdfResult.pages,
      paperId,
      file.name,
      fileHash,
      pdfResult.metadata
    );

    // Save initial structure (partial state)
    paper.processingStatus = "translating";
    await savePaper(paper);
    await saveSections(sections);
    await saveBlocks(blocks);

    // Notify that partial data is ready
    callbacks.onPartialReady(paper, sections, blocks);

    callbacks.onProgress({
      stage: "structuring",
      stageProgress: 1,
      stageTotal: 1,
      message: "構造解析が完了しました",
      paper,
      sections,
      blocks,
    });

    // Stage 4: Translation
    callbacks.onStageChange("translating");

    // Translate title first
    if (paper.titleOriginal) {
      try {
        const translatedTitle = await translateTitle(
          paper.titleOriginal,
          translationConfig
        );
        paper.titleTranslated = translatedTitle;
        await savePaper(paper);
      } catch (e) {
        console.error("Failed to translate title:", e);
      }
    }

    // Translate section titles
    const sectionTranslations = await translateSectionTitles(
      sections,
      translationConfig,
      (completed, total) => {
        callbacks.onProgress({
          stage: "translating",
          stageProgress: completed,
          stageTotal: total + blocks.filter((b) => b.translationStatus === "pending").length,
          message: `セクションタイトルを翻訳しています... (${completed}/${total})`,
          paper,
          sections,
          blocks,
        });
      }
    );

    // Update sections with translations
    for (const section of sections) {
      const translation = sectionTranslations.get(section.id);
      if (translation) {
        section.translatedTitle = translation;
      }
    }
    await saveSections(sections);

    // Translate blocks
    const sectionCount = sections.length;

    await translateBlocks(
      blocks,
      sections,
      translationConfig,
      (completed, total) => {
        callbacks.onProgress({
          stage: "translating",
          stageProgress: sectionCount + completed,
          stageTotal: sectionCount + total,
          message: `本文を翻訳しています... (${completed}/${total}段落)`,
          paper,
          sections,
          blocks,
        });
      },
      async (block, translation) => {
        // Update block in memory and database
        block.translated = translation;
        block.translationStatus = "completed";
        await updateBlock(block);
      }
    );

    // Stage 5: Finalizing
    callbacks.onStageChange("saving");
    callbacks.onProgress({
      stage: "saving",
      stageProgress: 0,
      stageTotal: 1,
      message: "保存しています...",
    });

    paper.processingStatus = "ready";
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
    const message = error instanceof Error ? error.message : "不明なエラー";
    callbacks.onStageChange("failed");
    callbacks.onProgress({
      stage: "failed",
      stageProgress: 0,
      stageTotal: 1,
      message: `エラー: ${message}`,
      error: message,
    });
    return null;
  }
}
