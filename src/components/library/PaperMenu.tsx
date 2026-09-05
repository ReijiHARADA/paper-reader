import { useEffect, useRef, useState } from "react";
import { FolderPlus, MoreHorizontal, Star, Trash2, UserMinus } from "lucide-react";
import type { Paper } from "../../types/paper";
import { useLibraryCache } from "../../stores/libraryCache";
import { useProjectStore } from "../../stores/projectStore";
import { showToast } from "../../stores/toastStore";
import { setPaperFavorite } from "../../services/database";
import {
  addPaperToProject,
  DuplicateProjectPaperError,
} from "../../services/projectService";
import styles from "./PaperCard.module.css";

type PaperMenuProps = {
  paper: Paper;
  variant: "library" | "project";
  onDeleteRequest?: (event: React.MouseEvent, paperId: string) => void;
  onRemoveFromProject?: (paperId: string) => void;
};

export function PaperMenu({
  paper,
  variant,
  onDeleteRequest,
  onRemoveFromProject,
}: PaperMenuProps) {
  const [open, setOpen] = useState(false);
  const [pickingProject, setPickingProject] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const updatePaper = useLibraryCache((state) => state.updatePaper);
  const projects = useProjectStore((state) => state.projects);
  const memberships = useProjectStore((state) => state.memberships);
  const upsertMembership = useProjectStore((state) => state.upsertMembership);

  useEffect(() => {
    if (!open && !pickingProject) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setPickingProject(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setPickingProject(false);
      }
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, pickingProject]);

  const toggleFavorite = async (event: React.MouseEvent) => {
    event.stopPropagation();
    const next = !paper.favorite;
    await setPaperFavorite(paper.id, next);
    updatePaper(paper.id, { favorite: next });
    setOpen(false);
    showToast({
      kind: "success",
      message: next ? "お気に入りに追加しました" : "お気に入りを外しました",
    });
  };

  const addToProject = async (event: React.MouseEvent, projectId: string) => {
    event.stopPropagation();
    const project = projects.find((item) => item.id === projectId);
    try {
      const link = await addPaperToProject({ projectId, paperId: paper.id });
      upsertMembership(link);
      showToast({
        kind: "success",
        message: `「${project?.name ?? "プロジェクト"}」に追加しました`,
      });
    } catch (error) {
      if (error instanceof DuplicateProjectPaperError) {
        showToast({
          kind: "info",
          message: `「${project?.name ?? "プロジェクト"}」にはすでに入っています`,
        });
      } else {
        showToast({ kind: "error", message: "プロジェクトへの追加に失敗しました" });
      }
    }
    setPickingProject(false);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={styles.menuRoot} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className={styles.menuButton}
        title="論文の操作"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
          setPickingProject(false);
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <button type="button" role="menuitem" onClick={(event) => void toggleFavorite(event)}>
            <Star size={14} fill={paper.favorite ? "currentColor" : "none"} />
            {paper.favorite ? "お気に入りを外す" : "お気に入り"}
          </button>
          {variant === "library" && (
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setPickingProject(true);
              }}
            >
              <FolderPlus size={14} />
              プロジェクトに追加…
            </button>
          )}
          {variant === "project" && onRemoveFromProject && (
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                onRemoveFromProject(paper.id);
              }}
            >
              <UserMinus size={14} />
              Projectから外す
            </button>
          )}
          {variant === "library" && onDeleteRequest && (
            <>
              <div className={styles.menuSep} />
              <button
                type="button"
                role="menuitem"
                className={styles.menuDanger}
                onClick={(event) => {
                  setOpen(false);
                  onDeleteRequest(event, paper.id);
                }}
              >
                <Trash2 size={14} />
                ライブラリから削除…
              </button>
            </>
          )}
        </div>
      )}
      {pickingProject && (
        <div className={styles.menu} role="menu">
          {projects.length === 0 ? (
            <p className={styles.menuEmpty}>プロジェクトがありません</p>
          ) : (
            projects.map((project) => {
              const already = memberships.some(
                (link) => link.projectId === project.id && link.paperId === paper.id
              );
              return (
                <button
                  key={project.id}
                  type="button"
                  role="menuitem"
                  disabled={already}
                  onClick={(event) => void addToProject(event, project.id)}
                >
                  {project.name}
                  {already ? "（追加済み）" : ""}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
