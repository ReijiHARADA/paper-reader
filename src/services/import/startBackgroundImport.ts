import { v4 as uuidv4 } from "uuid";
import { useLibraryCache } from "../../stores/libraryCache";
import { useImportJobStore } from "../../stores/importJobStore";
import { useProjectStore } from "../../stores/projectStore";
import { showToast } from "../../stores/toastStore";
import { upsertBlock, upsertSection } from "../../utils/mergePaperData";
import { createBlockUpdateBatcher } from "../../utils/batchBlockUpdates";
import { getSetting } from "../database";
import {
  addPaperToProject,
  placePaperInWorkspace,
  DuplicateProjectPaperError,
} from "../projectService";
import {
  checkMADLADAvailability,
  importPDFV2,
  type ImportConfig,
} from "../importServiceV2";

const startedImportKeys = new Set<string>();

const blockBatcher = createBlockUpdateBatcher((id, batch) => {
  useLibraryCache
    .getState()
    .setBlocks(id, (prev) => batch.reduce((acc, block) => upsertBlock(acc, block), prev));
});

function fileKeyOf(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

async function attachToProject(projectId: string, paperId: string, folderId?: string): Promise<void> {
  try {
    const link = folderId
      ? await placePaperInWorkspace(paperId, folderId)
      : await addPaperToProject({ projectId, paperId });
    useProjectStore.getState().upsertMembership(link);
  } catch (error) {
    if (error instanceof DuplicateProjectPaperError) return;
    console.error("Failed to add imported paper to project:", error);
    showToast({ kind: "error", message: "論文はライブラリに保存しましたが、指定先への配置に失敗しました" });
  }
}

async function runImport(jobId: string, file: File, fileKey: string, projectId?: string, folderId?: string): Promise<void> {
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
            if (projectId && !attached) {
              attached = true;
              void attachToProject(projectId, next.paper.id, folderId);
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
          if (projectId && !attached) {
            attached = true;
            void attachToProject(projectId, paper.id, folderId);
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
      useLibraryCache.getState().addPaper(result.paper);
      useLibraryCache.getState().setSections(result.paper.id, result.sections);
      useLibraryCache.getState().setBlocks(result.paper.id, result.blocks);
      patch(jobId, { paperId: result.paper.id, stage: "completed" });
      if (projectId && !attached) {
        attached = true;
        void attachToProject(projectId, result.paper.id, folderId);
      }
      return;
    }

    startedImportKeys.delete(fileKey);
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
  options?: { projectId?: string; folderId?: string }
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
  useImportJobStore.getState().upsertJob({
    id: jobId,
    fileName: file.name,
    fileKey,
    projectId: options?.projectId,
    stage: "reading",
    stageProgress: 0,
    stageTotal: 1,
    message: "読み込み中...",
  });
  showToast({ kind: "success", message: "PDFを追加しました" });
  void runImport(jobId, file, fileKey, options?.projectId, options?.folderId);
  return true;
}
