import { Folder } from "lucide-react";
import type { WorkspaceNode } from "../../types/project";
import cardStyles from "../library/PaperCard.module.css";
import styles from "./ProjectScreen.module.css";

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
      className={`${cardStyles.card} ${dropTarget ? styles.folderDropTarget : ""}`}
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
      <div className={cardStyles.icon}>
        <Folder size={24} strokeWidth={1.5} />
      </div>
      <div className={cardStyles.info}>
        <div className={cardStyles.titleRow}>
          <h3 className={cardStyles.title}>{node.name}</h3>
        </div>
        {node.description && <p className={cardStyles.originalTitle}>{node.description}</p>}
        <div className={cardStyles.meta}>
          <span className={cardStyles.date}>{meta}</span>
        </div>
      </div>
    </article>
  );
}
