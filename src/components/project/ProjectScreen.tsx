import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FileText,
  Plus,
  Trash2,
  Loader2,
  FolderX,
} from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useProjectStore } from "../../stores/projectStore";
import {
  removePaperFromProject,
  listPapersForProject,
  removeProject,
} from "../../services/projectService";
import { tryStartPdfImport } from "../../services/pdfImport";
import { PaperCard } from "../library/PaperCard";
import type { Paper } from "../../types/paper";
import styles from "./ProjectScreen.module.css";
import cardStyles from "../library/PaperCard.module.css";

export function ProjectScreen() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const setCurrentPaper = useAppStore((s) => s.setCurrentPaper);
  const { projects, memberships, removeMembershipLocal, removeProjectLocal } =
    useProjectStore();

  const project = projects.find((p) => p.id === projectId);
  const [projectPapers, setProjectPapers] = useState<Paper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!projectId) return;
    setIsLoading(true);
    listPapersForProject(projectId)
      .then(setProjectPapers)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [projectId, memberships]);

  useEffect(() => {
    if (!confirmDelete) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) setConfirmDelete(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDelete, deleting]);

  const handleFileSelect = useCallback(
    async (file: File) => {
      await tryStartPdfImport(file, navigate, { projectId });
    },
    [navigate, projectId]
  );

  const handleOpen = (paperId: string) => {
    setCurrentPaper(paperId);
    navigate(`/reader/${paperId}?project=${projectId}`);
  };

  const handleRemove = async (paperId: string) => {
    if (!projectId) return;
    await removePaperFromProject(projectId, paperId);
    removeMembershipLocal(projectId, paperId);
  };

  const handleDeleteProject = async () => {
    if (!projectId || deleting) return;
    setDeleting(true);
    try {
      await removeProject(projectId);
      removeProjectLocal(projectId);
      navigate("/inbox");
    } catch (error) {
      console.error("Failed to delete project:", error);
      setDeleting(false);
    }
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
          <button
            type="button"
            className={styles.deleteIconButton}
            onClick={() => setConfirmDelete(true)}
            title="プロジェクトを削除"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      {confirmDelete && (
        <div
          className={styles.deleteOverlay}
          role="presentation"
          onClick={() => {
            if (!deleting) setConfirmDelete(false);
          }}
        >
          <div
            className={styles.deleteDialog}
            role="dialog"
            aria-labelledby="delete-project-title"
            aria-describedby="delete-project-body"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.deleteDialogIcon}>
              <Trash2 size={22} />
            </div>
            <h2 id="delete-project-title" className={styles.deleteDialogTitle}>
              「{project?.name}」を削除しますか？
            </h2>
            <p id="delete-project-body" className={styles.deleteDialogBody}>
              論文ファイルは残ります。このプロジェクトにしか入っていない論文は Inbox に戻ります。
            </p>
            <div className={styles.deleteDialogActions}>
              <button
                type="button"
                className={styles.deleteConfirmNo}
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className={styles.deleteConfirmYes}
                disabled={deleting}
                onClick={() => void handleDeleteProject()}
              >
                {deleting ? "削除中..." : "削除する"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className={styles.loadingWrap}>
          <Loader2 size={28} className={styles.spin} />
          <p>読み込み中...</p>
        </div>
      ) : projectPapers.length === 0 ? (
        <div className={styles.emptyState}>
          <FileText size={48} strokeWidth={1} />
          <p>まだ論文がありません</p>
          <p className={styles.hint}>
            右上の「論文を追加」か、PDF をこの画面にドロップするとこのプロジェクトに入ります。Inbox や All Papers のカードをサイドバーへドラッグしても追加できます。戻すときは Inbox へドラッグします。
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {projectPapers.map((paper) => (
            <PaperCard
              key={paper.id}
              paper={paper}
              onOpen={() => handleOpen(paper.id)}
              actions={
                <button
                  type="button"
                  className={cardStyles.actionButton}
                  title="このProjectから外す"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRemove(paper.id);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
