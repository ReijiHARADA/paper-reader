import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FileText,
  Plus,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  FolderX,
} from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useProjectStore } from "../../stores/projectStore";
import {
  removePaperFromProject,
  listPapersForProject,
  removeProject,
} from "../../services/projectService";
import { displayPaperTitle } from "../../services/translation/quality";
import {
  isBusyProcessingStatus,
  processingStatusLabel,
} from "../../services/paperStatus";
import { DraggablePaperArticle } from "../library/DraggablePaperArticle";
import type { Paper } from "../../types/paper";
import styles from "./ProjectScreen.module.css";

function getStatusIcon(status: Paper["processingStatus"]) {
  if (isBusyProcessingStatus(status)) {
    return <Loader2 size={14} className={styles.statusProcessing} />;
  }
  switch (status) {
    case "ready":
      return <CheckCircle size={14} className={styles.statusReady} />;
    case "partial":
    case "failed":
      return <AlertCircle size={14} className={styles.statusFailed} />;
    default:
      return <Clock size={14} className={styles.statusPending} />;
  }
}

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
      <input ref={fileInputRef} type="file" accept=".pdf" className={styles.hiddenInput} />

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{project?.name ?? "…"}</h1>
          {project?.description && (
            <p className={styles.description}>{project.description}</p>
          )}
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.addButton}
            onClick={() => fileInputRef.current?.click()}
            title="このProjectへPDFを追加"
          >
            <Plus size={18} />
            論文を追加
          </button>
        </div>
      </header>

      {confirmDelete ? (
        <div className={styles.deleteConfirm}>
          <p>
            「{project?.name}」を削除します。論文ファイルは残ります。このプロジェクトにしか入っていない論文は Inbox に戻ります。
          </p>
          <button
            type="button"
            className={styles.deleteConfirmYes}
            disabled={deleting}
            onClick={() => void handleDeleteProject()}
          >
            {deleting ? "削除中..." : "削除する"}
          </button>
          <button
            type="button"
            className={styles.deleteConfirmNo}
            disabled={deleting}
            onClick={() => setConfirmDelete(false)}
          >
            キャンセル
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.deleteProject}
          onClick={() => setConfirmDelete(true)}
        >
          プロジェクトを削除
        </button>
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
          <p className={styles.hint}>Inbox や All Papers のカードを、サイドバーのこのプロジェクトへドラッグして追加できます。戻すときは Inbox へドラッグします。</p>
        </div>
      ) : (
        <div className={styles.list}>
          {projectPapers.map((paper) => (
            <DraggablePaperArticle
              key={paper.id}
              paperId={paper.id}
              label={displayPaperTitle(paper)}
              className={styles.card}
              onOpen={() => handleOpen(paper.id)}
            >
              <div className={styles.cardIcon}>
                <FileText size={28} strokeWidth={1.5} />
              </div>
              <div className={styles.cardInfo}>
                <h3 className={styles.cardTitle}>{displayPaperTitle(paper)}</h3>
                {paper.authors.length > 0 && (
                  <p className={styles.cardAuthors}>
                    {paper.authors.slice(0, 3).join(", ")}
                    {paper.authors.length > 3 && " ほか"}
                  </p>
                )}
                <div className={styles.cardMeta}>
                  {getStatusIcon(paper.processingStatus)}
                  <span>{processingStatusLabel(paper.processingStatus)}</span>
                  <span className={styles.cardYear}>{paper.year ?? ""}</span>
                </div>
              </div>
              <div className={styles.actions}>
                <button
                  className={styles.removeButton}
                  title="このProjectから外す"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRemove(paper.id);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </DraggablePaperArticle>
          ))}
        </div>
      )}
    </div>
  );
}
