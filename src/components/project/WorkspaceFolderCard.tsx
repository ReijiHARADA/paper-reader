import { Folder } from "lucide-react";
import type { WorkspaceNode } from "../../types/project";
import styles from "./WorkspaceFolderCard.module.css";

type WorkspaceFolderCardProps = {
  node: WorkspaceNode;
  childFolderCount: number;
  paperCount: number;
  dropTarget?: boolean;
  onOpen: () => void;
};

export function WorkspaceFolderCard({
  node,
  childFolderCount,
  paperCount,
  dropTarget = false,
  onOpen,
}: WorkspaceFolderCardProps) {
  const meta = [
    "フォルダ",
    childFolderCount > 0 ? `子フォルダ ${childFolderCount}` : null,
    `論文 ${paperCount}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={`${styles.card} ${dropTarget ? styles.dropTarget : ""}`}
      data-project-drop-id={node.id}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className={styles.icon}>
        <Folder size={22} strokeWidth={1.5} />
      </div>
      <div className={styles.info}>
        <h3 className={styles.title}>{node.name}</h3>
        {node.description && <p className={styles.description}>{node.description}</p>}
        <p className={styles.meta}>{meta}</p>
      </div>
    </article>
  );
}
