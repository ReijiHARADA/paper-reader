import { useEffect, useRef, useState } from "react";
import { Check, FolderPlus, Plus } from "lucide-react";
import type { Project } from "../../types/project";
import styles from "./AddToProjectMenu.module.css";

type AddToProjectMenuProps = {
  projects: Project[];
  addedProjectIds: string[];
  onAdd: (projectId: string) => void;
  onRemove?: (projectId: string) => void;
  onCreateProject?: () => void;
};

export function AddToProjectMenu({
  projects,
  addedProjectIds,
  onAdd,
  onRemove,
  onCreateProject,
}: AddToProjectMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        title="Add to Project"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <FolderPlus size={16} />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <p className={styles.heading}>Add to Project</p>
          {projects.length === 0 && (
            <p className={styles.empty}>まだ Project がありません</p>
          )}
          {projects.map((project) => {
            const added = addedProjectIds.includes(project.id);
            return (
              <button
                key={project.id}
                type="button"
                className={styles.item}
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  if (added) {
                    onRemove?.(project.id);
                  } else {
                    onAdd(project.id);
                  }
                }}
              >
                <span className={styles.check}>{added ? <Check size={14} /> : null}</span>
                {project.name}
              </button>
            );
          })}
          {onCreateProject && (
            <button
              type="button"
              className={styles.create}
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                onCreateProject();
              }}
            >
              <Plus size={14} />
              New Project
            </button>
          )}
        </div>
      )}
    </div>
  );
}
