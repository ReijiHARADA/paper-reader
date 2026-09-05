import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  FilePlus2,
  Folder,
  FolderOpen,
  FolderKanban,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import type { WorkspaceNode } from "../../types/project";
import { buildWorkspaceTree } from "../../data/workspace/tree";
import styles from "./AppSidebar.module.css";

type WorkspaceTreeProps = {
  nodes: WorkspaceNode[];
  activeProjectId?: string | null;
  dropTargetId?: string | null;
  draggingPaperId?: string | null;
  onDelete: (node: WorkspaceNode) => void;
  onRenameProject: (node: WorkspaceNode) => void;
  onAddPaper: (node: WorkspaceNode) => void;
};

export function WorkspaceTree({
  nodes,
  activeProjectId,
  dropTargetId,
  draggingPaperId,
  onDelete,
  onRenameProject,
  onAddPaper,
}: WorkspaceTreeProps) {
  const tree = useMemo(() => buildWorkspaceTree(nodes), [nodes]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const treeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!openMenuId) return;
    const onPointerDown = (event: PointerEvent) => {
      if (treeRef.current?.contains(event.target as Node)) return;
      setOpenMenuId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenuId(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenuId]);

  if (tree.length === 0) {
    return <p className={`${styles.empty} ${styles.label}`}>研究テーマを追加</p>;
  }

  return (
    <nav ref={treeRef} className={styles.nav}>
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
          openMenuId={openMenuId}
          setOpenMenuId={setOpenMenuId}
          onRenameProject={onRenameProject}
          onAddPaper={onAddPaper}
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
  openMenuId,
  setOpenMenuId,
  onRenameProject,
  onAddPaper,
}: {
  node: ReturnType<typeof buildWorkspaceTree>[number];
  depth: number;
  collapsed: Record<string, boolean>;
  setCollapsed: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  activeProjectId?: string | null;
  dropTargetId?: string | null;
  draggingPaperId?: string | null;
  onDelete: (node: WorkspaceNode) => void;
  openMenuId: string | null;
  setOpenMenuId: React.Dispatch<React.SetStateAction<string | null>>;
  onRenameProject: (node: WorkspaceNode) => void;
  onAddPaper: (node: WorkspaceNode) => void;
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
              openMenuId={openMenuId}
              setOpenMenuId={setOpenMenuId}
              onRenameProject={onRenameProject}
              onAddPaper={onAddPaper}
            />
          ))}
      </div>
    );
  }

  const menuOpen = openMenuId === node.id;

  return (
    <div className={styles.projectRow} data-project-drop-id={node.id}>
      <NavLink
        to={`/project/${node.id}`}
        className={({ isActive }) =>
          `${styles.item} ${styles.projectLink} ${
            isActive || activeProjectId === node.id ? styles.active : ""
          } ${dropTargetId === node.id ? styles.dropTarget : ""}`
        }
        style={pad}
        title={node.name}
        onClick={(event) => {
          if (draggingPaperId) event.preventDefault();
          setOpenMenuId(null);
        }}
      >
        <span className={styles.icon}>
          <FolderKanban size={16} />
        </span>
        <span className={styles.itemLabel}>{node.name}</span>
      </NavLink>
      <button
        type="button"
        className={`${styles.projectMenuButton} ${menuOpen ? styles.projectMenuButtonOpen : ""}`}
        aria-label={`「${node.name}」のメニュー`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="プロジェクトの操作"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpenMenuId((current) => (current === node.id ? null : node.id));
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      {menuOpen && (
        <div className={styles.projectMenu} role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenMenuId(null);
              onRenameProject(node);
            }}
          >
            <Pencil size={14} />
            名称を変更
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenMenuId(null);
              onAddPaper(node);
            }}
          >
            <FilePlus2 size={14} />
            論文ファイルを追加
          </button>
          <div className={styles.projectMenuSeparator} />
          <button
            type="button"
            role="menuitem"
            className={styles.projectMenuDanger}
            onClick={() => {
              setOpenMenuId(null);
              onDelete(node);
            }}
          >
            <Trash2 size={14} />
            プロジェクトを削除
          </button>
        </div>
      )}
    </div>
  );
}
