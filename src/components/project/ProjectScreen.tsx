import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FileText, Plus, Trash2, Loader2, CheckCircle, AlertCircle, Clock, FolderX } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useProjectStore } from "../../stores/projectStore";
import {
  addPaperToProject,
  removePaperFromProject,
  listPapersForProject,
} from "../../services/projectService";
import { AddToProjectMenu } from "./AddToProjectMenu";
import { NewProjectModal } from "./NewProjectModal";
import { createProject } from "../../services/projectService";
import { displayPaperTitle } from "../../services/translation/quality";
import type { Paper } from "../../types/paper";
import styles from "./ProjectScreen.module.css";

function getStatusIcon(status: Paper["processingStatus"]) {
  switch (status) {
    case "ready": return <CheckCircle size={14} className={styles.statusReady} />;
    case "translating": case "extracting": case "structuring": case "glossary":
      return <Loader2 size={14} className={styles.statusProcessing} />;
    case "failed": return <AlertCircle size={14} className={styles.statusFailed} />;
    default: return <Clock size={14} className={styles.statusPending} />;
  }
}

export function ProjectScreen() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const setCurrentPaper = useAppStore((s) => s.setCurrentPaper);
  const { projects, memberships, upsertMembership, removeMembershipLocal, upsertProject } = useProjectStore();

  const project = projects.find((p) => p.id === projectId);
  const [projectPapers, setProjectPapers] = useState<Paper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);

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
    if (!confirm("このProjectから論文を外しますか？論文自体は削除されません。")) return;
    await removePaperFromProject(projectId, paperId);
    removeMembershipLocal(projectId, paperId);
  };

  const handleAddPaper = async (targetProjectId: string, paperId: string) => {
    const link = await addPaperToProject({ projectId: targetProjectId, paperId });
    upsertMembership(link);
  };

  const handleCreateProject = async (input: { name: string; description?: string }) => {
    const p = await createProject(input);
    upsertProject(p);
  };

  // Papers not yet in this project (for potential future "add from library" button)
  const allProjectIds = (paperId: string) =>
    memberships.filter((m) => m.paperId === paperId).map((m) => m.projectId);

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
        <button
          className={styles.addButton}
          onClick={() => fileInputRef.current?.click()}
          title="このProjectへPDFを追加"
        >
          <Plus size={18} />
          論文を追加
        </button>
      </header>

      {isLoading ? (
        <div className={styles.loadingWrap}>
          <Loader2 size={28} className={styles.spin} />
          <p>読み込み中...</p>
        </div>
      ) : projectPapers.length === 0 ? (
        <div className={styles.emptyState}>
          <FileText size={48} strokeWidth={1} />
          <p>まだ論文がありません</p>
          <p className={styles.hint}>ライブラリの論文カードにある <strong>+</strong> ボタンでこのProjectへ追加できます</p>
        </div>
      ) : (
        <div className={styles.list}>
          {projectPapers.map((paper) => (
            <article
              key={paper.id}
              className={styles.card}
              onClick={() => handleOpen(paper.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleOpen(paper.id); }}
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
                  <span className={styles.cardYear}>{paper.year ?? ""}</span>
                </div>
              </div>
              <div className={styles.actions}>
                <AddToProjectMenu
                  projects={projects}
                  addedProjectIds={allProjectIds(paper.id)}
                  onAdd={(pid) => handleAddPaper(pid, paper.id)}
                  onRemove={(pid) => pid === projectId ? handleRemove(paper.id) : removePaperFromProject(pid, paper.id)}
                  onCreateProject={() => setShowNewProject(true)}
                />
                <button
                  className={styles.removeButton}
                  title="このProjectから外す"
                  onClick={(e) => { e.stopPropagation(); handleRemove(paper.id); }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreate={handleCreateProject}
        />
      )}
    </div>
  );
}
