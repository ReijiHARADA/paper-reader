import { v4 as uuidv4 } from "uuid";
import { useLibraryCache } from "../../stores/libraryCache";
import { useImportJobStore, type ImportJob } from "../../stores/importJobStore";
import { useProjectStore } from "../../stores/projectStore";
import { showToast } from "../../stores/toastStore";
import type { Paper, PaperBlock, Section } from "../../types/paper";
import { upsertBlock, upsertSection } from "../../utils/mergePaperData";
import { createBlockUpdateBatcher } from "../../utils/batchBlockUpdates";
import { waitForServer } from "../../utils/serverReady";
import { getAllPapers, getBlocksByPaper, getSectionsByPaper, getSetting } from "../database";
import { addPaperToWorkspace } from "../projectService";
import {
  checkMADLADAvailability,
  importPDFV2,
  type ImportConfig,
} from "../importServiceV2";
import { resumeIncompleteTranslation } from "./resume";
import { referenceSectionIds, isRetryableTranslationFailure, shouldTranslateBlock, shouldTranslateSection } from "./policy";
import { isPlausibleJaTranslation, shouldTranslateTitle, titleTranslationComplete } from "../translation/quality";

const startedImportKeys = new Set<string>();
const importFiles = new Map<string, File>();
export const SERVER_UNAVAILABLE_MESSAGE = "翻訳サーバーに接続できません";

const blockBatcher = createBlockUpdateBatcher((id, batch) => {
  useLibraryCache
    .getState()
    .setBlocks(id, (prev) => batch.reduce((acc, block) => upsertBlock(acc, block), prev));
});

function fileKeyOf(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function isServerUnavailableMessage(message: string | undefined): boolean {
  return Boolean(message && message.includes(SERVER_UNAVAILABLE_MESSAGE));
}

function libraryTranslationCallbacks() {
  return {
    onBlockTranslated: (block: PaperBlock) => {
      blockBatcher.push(block);
    },
    onPaperUpdated: (paper: Paper) => {
      useLibraryCache.getState().addPaper(paper);
      useLibraryCache.getState().updatePaper(paper.id, paper);
    },
    onSectionTranslated: (section: Section) => {
      useLibraryCache
        .getState()
        .setSections(section.paperId, (prev) => upsertSection(prev, section));
    },
  };
}

export async function shouldResumePaperAfterServerReady(paper: Paper): Promise<boolean> {
  if (paper.processingStatus === "translating" || paper.processingStatus === "queued" || paper.processingStatus === "glossary") {
    return true;
  }

  const [sections, blocks] = await Promise.all([
    getSectionsByPaper(paper.id),
    getBlocksByPaper(paper.id),
  ]);
  const refSectionIds = referenceSectionIds(sections);
  if (blocks.some((block) => isRetryableTranslationFailure(block, refSectionIds))) return true;
  if (
    paper.titleOriginal &&
    shouldTranslateTitle(paper.titleOriginal) &&
    (!paper.titleTranslated || !titleTranslationComplete(paper.titleOriginal, paper.titleTranslated))
  ) {
    return true;
  }
  if (
    sections.some(
      (section) =>
        section.originalTitle &&
        shouldTranslateSection(section) &&
        (!section.translatedTitle || !isPlausibleJaTranslation(section.translatedTitle, section.originalTitle))
    )
  ) {
    return true;
  }
  return blocks.some(
    (block) =>
      shouldTranslateBlock(block, refSectionIds) &&
      (!block.translated || !isPlausibleJaTranslation(block.translated, block.original || ""))
  );
}

async function attachToWorkspace(nodeId: string, paperId: string): Promise<void> {
  try {
    const link = await addPaperToWorkspace(nodeId, paperId);
    useProjectStore.getState().upsertMembership(link);
  } catch (error) {
    if (error instanceof Error && error.message.includes("すでに")) return;
    console.error("Failed to add imported paper to project:", error);
    showToast({ kind: "error", message: "論文はライブラリに保存しましたが、指定先への配置に失敗しました" });
  }
}

/** Wait for MADLAD instead of failing the job while the sidecar is still booting. */
async function ensureMadladReady(
  jobId: string,
  patch: (id: string, next: Partial<ImportJob>) => void
): Promise<boolean> {
  const first = await checkMADLADAvailability();
  if (first.available) return true;

  patch(jobId, {
    stage: "reading",
    message: "翻訳サーバーの起動を待っています...",
    error: undefined,
  });

  try {
    await waitForServer((attempt) => {
      patch(jobId, {
        stage: "reading",
        message:
          attempt > 5
            ? `翻訳サーバーの起動を待っています…（${attempt}秒）`
            : "翻訳サーバーの起動を待っています...",
      });
    }, 90);
    const again = await checkMADLADAvailability();
    return again.available;
  } catch {
    return false;
  }
}

async function runImport(jobId: string, file: File, fileKey: string, workspaceNodeId?: string): Promise<void> {
  const patch = useImportJobStore.getState().patchJob;
  const ready = await ensureMadladReady(jobId, patch);
  if (!ready) {
    patch(jobId, {
      stage: "failed",
      error: SERVER_UNAVAILABLE_MESSAGE,
      message: SERVER_UNAVAILABLE_MESSAGE,
    });
    startedImportKeys.delete(fileKey);
    showToast({ kind: "error", message: SERVER_UNAVAILABLE_MESSAGE });
    return;
  }

  const settings = await getSetting<ImportConfig>("translationSettingsV2");
  let attached = false;

  try {
    const result = await importPDFV2(
      file,
      {
        onProgress: (next) => {
          const progressPatch = {
            stage: next.stage,
            stageProgress: next.stageProgress,
            stageTotal: next.stageTotal,
            message: next.message,
            error: next.error,
            ...(next.paper ? { paperId: next.paper.id } : {}),
          };
          // Most progress events do not carry the paper. Once partial-ready has
          // materialized the real card, do not clear its id and resurrect the
          // temporary import card on the next progress event.
          patch(jobId, progressPatch);
          if (next.stage === "completed" && next.paper) {
            useLibraryCache.getState().addPaper(next.paper);
            if (workspaceNodeId && !attached) {
              attached = true;
              void attachToWorkspace(workspaceNodeId, next.paper.id);
            }
          }
        },
        onStageChange: (stage) => {
          patch(jobId, { stage });
        },
        onPartialReady: (paper, sections, blocks) => {
          useLibraryCache.getState().addPaper(paper);
          useLibraryCache.getState().setSections(paper.id, sections);
          useLibraryCache.getState().setBlocks(paper.id, blocks);
          patch(jobId, { paperId: paper.id });
          if (workspaceNodeId && !attached) {
            attached = true;
            void attachToWorkspace(workspaceNodeId, paper.id);
          }
        },
        onBlockTranslated: (block) => {
          blockBatcher.push(block);
        },
        onPaperUpdated: (paper) => {
          useLibraryCache.getState().updatePaper(paper.id, paper);
        },
        onSectionTranslated: (section) => {
          useLibraryCache
            .getState()
            .setSections(section.paperId, (prev) => upsertSection(prev, section));
        },
      },
      settings || {}
    );

    if (result) {
      importFiles.delete(jobId);
      useLibraryCache.getState().addPaper(result.paper);
      useLibraryCache.getState().setSections(result.paper.id, result.sections);
      useLibraryCache.getState().setBlocks(result.paper.id, result.blocks);
      patch(jobId, { paperId: result.paper.id, stage: "completed" });
      if (workspaceNodeId && !attached) {
        attached = true;
        void attachToWorkspace(workspaceNodeId, result.paper.id);
      }
      return;
    }

    startedImportKeys.delete(fileKey);
    importFiles.delete(jobId);
    useImportJobStore.getState().removeJob(jobId);
    showToast({ kind: "info", message: "このPDFは既にインポートされています" });
  } catch (error) {
    startedImportKeys.delete(fileKey);
    const message = error instanceof Error ? error.message : "読み込みに失敗しました";
    patch(jobId, { stage: "failed", error: message, message });
    showToast({ kind: "error", message: "読み込みに失敗しました" });
  }
}

export async function startBackgroundImport(
  file: File,
  options?: { workspaceNodeId?: string }
): Promise<boolean> {
  const looksPdf = file.type.includes("pdf") || file.name.toLowerCase().split("?")[0].endsWith(".pdf");
  if (!looksPdf) {
    showToast({ kind: "error", message: "PDF形式ではありません" });
    return false;
  }

  const fileKey = fileKeyOf(file);
  if (
    startedImportKeys.has(fileKey) ||
    useImportJobStore.getState().jobs.some((job) => job.fileKey === fileKey)
  ) {
    return false;
  }
  startedImportKeys.add(fileKey);

  const jobId = uuidv4();
  importFiles.set(jobId, file);
  useImportJobStore.getState().upsertJob({
    id: jobId,
    fileName: file.name,
    fileKey,
    workspaceNodeId: options?.workspaceNodeId,
    stage: "reading",
    stageProgress: 0,
    stageTotal: 1,
    message: "読み込み中...",
  });
  showToast({ kind: "success", message: "PDFを追加しました" });
  void runImport(jobId, file, fileKey, options?.workspaceNodeId);
  return true;
}


/** Retry a transient import failure while the original File is still available. */
export async function retryBackgroundImport(jobId: string): Promise<boolean> {
  const job = useImportJobStore.getState().jobs.find((item) => item.id === jobId);
  const file = importFiles.get(jobId);
  if (!job || !file) {
    showToast({ kind: "error", message: "元のPDFを保持できないため、もう一度追加してください" });
    return false;
  }
  if (startedImportKeys.has(job.fileKey)) return false;
  startedImportKeys.add(job.fileKey);
  useImportJobStore.getState().patchJob(jobId, {
    stage: "reading",
    stageProgress: 0,
    stageTotal: 1,
    message: "再試行中...",
    error: undefined,
  });
  void runImport(jobId, file, job.fileKey, job.workspaceNodeId);
  return true;
}

/** Dismiss a pre-persistence import failure without touching saved papers. */
export function dismissBackgroundImport(jobId: string): void {
  importFiles.delete(jobId);
  useImportJobStore.getState().removeJob(jobId);
}

/** Resume a saved paper whose translation was interrupted or failed. */
export async function retryPaperTranslation(paperId: string): Promise<boolean> {
  const madlad = await checkMADLADAvailability();
  if (!madlad.available) {
    showToast({ kind: "error", message: SERVER_UNAVAILABLE_MESSAGE });
    return false;
  }
  try {
    await resumeIncompleteTranslation(paperId, libraryTranslationCallbacks());
    showToast({ kind: "success", message: "翻訳を再試行しました" });
    return true;
  } catch (error) {
    console.error("Failed to resume translation:", error);
    showToast({ kind: "error", message: "翻訳の再試行に失敗しました" });
    return false;
  }
}

/**
 * After the sidecar becomes reachable, retry imports that failed only because
 * the server was down, and quietly resume incomplete saved translations.
 */
export function resumeAfterTranslationServerReady(): void {
  const failedJobs = useImportJobStore
    .getState()
    .jobs.filter(
      (job) =>
        job.stage === "failed" &&
        isServerUnavailableMessage(job.error ?? job.message) &&
        importFiles.has(job.id)
    );
  for (const job of failedJobs) {
    void retryBackgroundImport(job.id);
  }

  const settingsPromise = getSetting<ImportConfig>("translationSettingsV2");
  const callbacks = libraryTranslationCallbacks();
  void (async () => {
    const settings = (await settingsPromise) || {};
    const cached = useLibraryCache.getState().papers;
    const saved = await getAllPapers();
    const byId = new Map([...cached, ...saved].map((paper) => [paper.id, paper]));
    for (const paper of byId.values()) {
      if (!(await shouldResumePaperAfterServerReady(paper))) continue;
      void resumeIncompleteTranslation(paper.id, callbacks, settings);
    }
  })().catch((error) => {
    console.error("Failed to resume translations after server ready:", error);
  });
}
