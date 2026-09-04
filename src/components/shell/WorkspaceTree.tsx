import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { Folder, FolderOpen, FolderKanban } from "lucide-react";
import type { WorkspaceNode } from "../../types/project";
import { buildWorkspaceTree } from "../../data/workspace/tree";
import styles from "./AppSidebar.module.css";

type WorkspaceTreeProps = {
  nodes: WorkspaceNode[];
  activeProjectId?: string | null;
  dropTargetId?: string | null;
  draggingPaperId?: string | null;
  onDelete: (node: WorkspaceNode) => void;
};

export function WorkspaceTree({
  nodes,
  activeProjectId,
  dropTargetId,
  draggingPaperId,
  onDelete,
}: WorkspaceTreeProps) {
  const tree = useMemo(() => buildWorkspaceTree(nodes), [nodes]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (tree.length === 0) {
    return <p className={`${styles.empty} ${styles.label}`}>研究テーマを追加</p>;
  }

  return (
    <nav className={styles.nav}>
      {tree.map((node) => (
        <TreeItem
          key={node.id}
          node={node}
          depth={0}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          activeProjectId={activeProjectId}
          dropTargetId={dropTargetId}
          draggingPaperId={draggingPaperId}
          onDelete={onDelete}
        />
      ))}
    </nav>
  );
}

function TreeItem({
  node,
  depth,
  collapsed,
  setCollapsed,
  activeProjectId,
  dropTargetId,
  draggingPaperId,
  onDelete,
}: {
  node: ReturnType<typeof buildWorkspaceTree>[number];
  depth: number;
  collapsed: Record<string, boolean>;
  setCollapsed: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  activeProjectId?: string | null;
  dropTargetId?: string | null;
  draggingPaperId?: string | null;
  onDelete: (node: WorkspaceNode) => void;
}) {
  const isFolder = node.kind === "folder";
  const isOpen = !collapsed[node.id];
  const pad = { paddingLeft: depth === 0 ? undefined : `${8 + depth * 10}px` };

  if (isFolder) {
    return (
      <div>
        <button
          type="button"
          className={`${styles.item} ${styles.folderItem} ${
            dropTargetId === node.id ? styles.dropTarget : ""
          }`}
          data-folder-drop-id={node.id}
          style={pad}
          title={node.name}
          onClick={() =>
            setCollapsed((current) => ({ ...current, [node.id]: !current[node.id] }))
          }
          onContextMenu={(event) => {
            event.preventDefault();
            onDelete(node);
          }}
        >
          <span className={styles.icon}>
            {isOpen ? <FolderOpen size={16} /> : <Folder size={16} />}
          </span>
          <span className={styles.itemLabel}>{node.name}</span>
        </button>
        {isOpen &&
          node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              setCollapsed={setCollapsed}
              activeProjectId={activeProjectId}
              dropTargetId={dropTargetId}
              draggingPaperId={draggingPaperId}
              onDelete={onDelete}
            />
          ))}
      </div>
    );
  }

  return (
    <NavLink
      to={`/project/${node.id}`}
      data-project-drop-id={node.id}
      className={({ isActive }) =>
        `${styles.item} ${
          isActive || activeProjectId === node.id ? styles.active : ""
        } ${dropTargetId === node.id ? styles.dropTarget : ""}`
      }
      style={pad}
      title={node.name}
      onClick={(event) => {
        if (draggingPaperId) event.preventDefault();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onDelete(node);
      }}
    >
      <span className={styles.icon}>
        <FolderKanban size={16} />
      </span>
      <span className={styles.itemLabel}>{node.name}</span>
    </NavLink>
  );
}
