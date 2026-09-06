import { v4 as uuidv4 } from "uuid";
import { useLibraryCache } from "../../stores/libraryCache";
import { useImportJobStore } from "../../stores/importJobStore";
import { useProjectStore } from "../../stores/projectStore";
import { showToast } from "../../stores/toastStore";
import { upsertBlock, upsertSection } from "../../utils/mergePaperData";
import { createBlockUpdateBatcher } from "../../utils/batchBlockUpdates";
import { getSetting } from "../database";
import { addPaperToWorkspace } from "../projectService";
import {
  checkMADLADAvailability,
  importPDFV2,
  type ImportConfig,
} from "../importServiceV2";
import { resumeIncompleteTranslation } from "./resume";

const startedImportKeys = new Set<string>();
const importFiles = new Map<string, File>();

const blockBatcher = createBlockUpdateBatcher((id, batch) => {
  useLibraryCache
    .getState()
    .setBlocks(id, (prev) => batch.reduce((acc, block) => upsertBlock(acc, block), prev));
});

function fileKeyOf(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
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

async function runImport(jobId: string, file: File, fileKey: string, workspaceNodeId?: string): Promise<void> {
  const patch = useImportJobStore.getState().patchJob;
  const madlad = await checkMADLADAvailability();
  if (!madlad.available) {
    patch(jobId, {
      stage: "failed",
      error: "翻訳サーバーに接続できません",
      message: "翻訳サーバーに接続できません",
    });
    startedImportKeys.delete(fileKey);
    showToast({ kind: "error", message: "翻訳サーバーに接続できません" });
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
    showToast({ kind: "error", message: "翻訳サーバーに接続できません" });
    return false;
  }
  try {
    await resumeIncompleteTranslation(paperId, {
      onBlockTranslated: (block) => blockBatcher.push(block),
      onPaperUpdated: (paper) => useLibraryCache.getState().updatePaper(paper.id, paper),
      onSectionTranslated: (section) =>
        useLibraryCache.getState().setSections(section.paperId, (prev) =>
          upsertSection(prev, section)
        ),
    });
    showToast({ kind: "success", message: "翻訳を再試行しました" });
    return true;
  } catch (error) {
    console.error("Failed to resume translation:", error);
    showToast({ kind: "error", message: "翻訳の再試行に失敗しました" });
    return false;
  }
}
