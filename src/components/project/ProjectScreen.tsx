import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FileText,
  Plus,
  Loader2,
  FolderX,
} from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useLibraryCache } from "../../stores/libraryCache";
import { useImportJobStore, visibleImportJobs } from "../../stores/importJobStore";
import { useProjectStore } from "../../stores/projectStore";
import { showToast } from "../../stores/toastStore";
import { filterPapersByLibraryQuery } from "../../domain/librarySearch";
import { derivePaperReadiness } from "../../domain/paperReadiness";
import {
  addPaperToProject,
  removePaperFromProject,
  listPapersForProject,
} from "../../services/projectService";
import { tryStartPdfImport } from "../../services/pdfImport";
import { PaperCard } from "../library/PaperCard";
import { PaperMenu } from "../library/PaperMenu";
import { ImportJobCard } from "../library/ImportJobCard";
import type { Paper } from "../../types/paper";
import styles from "./ProjectScreen.module.css";

export function ProjectScreen() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const setCurrentPaper = useAppStore((s) => s.setCurrentPaper);
  const storePapers = useLibraryCache((s) => s.papers);
  const blocks = useLibraryCache((s) => s.blocks);
  const searchQuery = useProjectStore((s) => s.searchQuery);
  const importJobs = useImportJobStore((s) => s.jobs);
  const jobs = useMemo(
    () => visibleImportJobs(importJobs, { projectId }),
    [importJobs, projectId]
  );
  const projects = useProjectStore((state) => state.projects);
  const memberships = useProjectStore((state) => state.memberships);
  const removeMembershipLocal = useProjectStore((state) => state.removeMembershipLocal);
  const upsertMembership = useProjectStore((state) => state.upsertMembership);

  const project = projects.find((p) => p.id === projectId);
  const [projectPapers, setProjectPapers] = useState<Paper[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!projectId) return;
    setIsLoading(true);
    listPapersForProject(projectId)
      .then(setProjectPapers)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [projectId, memberships]);

  const handleFileSelect = useCallback(
    async (file: File) => {
      await tryStartPdfImport(file, { projectId });
    },
    [projectId]
  );

  const mergedPapers = useMemo(() => {
    const live = projectPapers.map((paper) => storePapers.find((item) => item.id === paper.id) ?? paper);
    return filterPapersByLibraryQuery(live, searchQuery);
  }, [projectPapers, searchQuery, storePapers]);

  const handleOpen = (paperId: string) => {
    const paper = mergedPapers.find((item) => item.id === paperId);
    if (!paper) return;
    const view = derivePaperReadiness({
      processingStatus: paper.processingStatus,
      blocks: blocks[paperId],
    });
    if (!view.canOpen) return;
    setCurrentPaper(paperId);
    navigate(`/reader/${paperId}?project=${projectId}`);
  };

  const handleRemove = async (paperId: string) => {
    if (!projectId) return;
    await removePaperFromProject(projectId, paperId);
    removeMembershipLocal(projectId, paperId);
    showToast({
      kind: "info",
      message: "Projectから外しました",
      actionLabel: "元に戻す",
      onAction: () => {
        void addPaperToProject({ projectId, paperId }).then((link) => {
          upsertMembership(link);
        });
      },
    });
  };

  if (!project && !isLoading) {
    return (
      <div className={styles.empty}>
        <FolderX size={48} strokeWidth={1} />
        <p>Project が見つかりません</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className={styles.hiddenInput}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFileSelect(file);
          event.target.value = "";
        }}
      />

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{project?.name ?? "…"}</h1>
          {project?.description && (
            <p className={styles.description}>{project.description}</p>
          )}
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.addButton}
            onClick={() => fileInputRef.current?.click()}
            title="このProjectへPDFを追加"
          >
            <Plus size={18} />
            論文を追加
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className={styles.loadingWrap}>
          <Loader2 size={28} className={styles.spin} />
          <p>読み込み中...</p>
        </div>
      ) : mergedPapers.length === 0 && jobs.length === 0 ? (
        <div className={styles.emptyState}>
          <FileText size={48} strokeWidth={1} />
          <p>{searchQuery.trim() ? "一致する論文がありません" : "まだ論文がありません"}</p>
          <p className={styles.hint}>
            右上の「論文を追加」か、PDF をこの画面にドロップするとこのプロジェクトに入ります。カードのメニューから外すこともできます。
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {jobs.map((job) => (
            <ImportJobCard key={job.id} job={job} />
          ))}
          {mergedPapers.map((paper) => (
            <PaperCard
              key={paper.id}
              paper={paper}
              onOpen={() => handleOpen(paper.id)}
              actions={
                <PaperMenu
                  paper={paper}
                  variant="project"
                  onRemoveFromProject={(id) => void handleRemove(id)}
                />
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
