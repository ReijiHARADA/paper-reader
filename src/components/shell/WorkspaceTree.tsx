import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { ChevronDown, ChevronRight, FileText, FilePlus2, Folder, FolderOpen, FolderKanban, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { WorkspaceNode } from "../../types/project";
import type { Paper } from "../../types/paper";
import { buildWorkspaceTree, owningProjectId } from "../../data/workspace/tree";
import { useProjectStore } from "../../stores/projectStore";
import { showToast } from "../../stores/toastStore";
import { useLibraryCache } from "../../stores/libraryCache";
import { useDraggablePaper } from "../library/useDraggablePaper";
import { useWorkspaceDrag } from "./useWorkspaceDrag";
import styles from "./AppSidebar.module.css";

type WorkspaceTreeProps = {
  nodes: WorkspaceNode[];
  activeProjectId?: string | null;
  dropTargetId?: string | null;
  draggingPaperId?: string | null;
  onDelete: (node: WorkspaceNode) => Promise<void>;
  onRenameNode: (node: WorkspaceNode, name: string) => Promise<void>;
  onAddPaper: (node: WorkspaceNode) => void;
};

export function WorkspaceTree({ nodes, activeProjectId, dropTargetId, draggingPaperId, onDelete, onRenameNode, onAddPaper }: WorkspaceTreeProps) {
  const tree = useMemo(() => buildWorkspaceTree(nodes), [nodes]);
  const memberships = useProjectStore((state) => state.memberships);
  const papers = useLibraryCache((state) => state.papers);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [menuError, setMenuError] = useState("");
  const treeRef = useRef<HTMLElement>(null);
  const drag = useWorkspaceDrag(nodes, (id) => {
    if (id) setCollapsed((current) => ({ ...current, [id]: false }));
  });
  useEffect(() => {
    if (!openMenuId) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!target.closest("[data-workspace-id]")?.querySelector("[role=menu]")) setOpenMenuId(null);
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenMenuId(null); };
    const sidebar = treeRef.current?.closest("aside");
    const close = () => setOpenMenuId(null);
    sidebar?.addEventListener("pointerleave", close);
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", key);
    return () => { sidebar?.removeEventListener("pointerleave", close); window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", key); };
  }, [openMenuId]);

  const renderNode = (node: ReturnType<typeof buildWorkspaceTree>[number], depth: number) => {
    const isFolder = node.kind === "folder";
    const isOpen = !collapsed[node.id];
    const projectId = owningProjectId(nodes, node.id);
    const menuOpen = openMenuId === node.id;
    const target = drag.drop?.id === node.id ? drag.drop : null;
    const toggle = () => setCollapsed((current) => ({ ...current, [node.id]: !current[node.id] }));
    const links = memberships.filter((link) => link.projectId === projectId &&
      (link.folderId ?? null) === (isFolder ? node.id : null))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt) || a.paperId.localeCompare(b.paperId));
    const icon = isFolder ? (isOpen ? <FolderOpen size={16} /> : <Folder size={16} />) : <FolderKanban size={16} />;
    return <div key={node.id}>
      <div className={`${styles.projectRow} ${styles.treeRow} ${menuOpen ? styles.treeRowMenuOpen : ""} ${target?.error ? styles.invalidDrop : ""} ${target ? styles["drop" + target.edge] : ""} ${dropTargetId === node.id ? styles.dropinside : ""} ${draggingPaperId && !projectId ? styles.paperInvalid : ""}`}
        data-workspace-id={node.id}
        data-project-drop-id={projectId ? node.id : undefined}
        data-paper-drop-invalid={!projectId ? "" : undefined}
        style={{ "--tree-indent": `${depth * 16}px` } as React.CSSProperties}
        onPointerDown={(event) => drag.onPointerDown(event, node.id)}
        onDragStart={(event) => event.preventDefault()}>
        <button type="button" className={styles.chevron} aria-label={`${node.name}を${isOpen ? "折りたたむ" : "展開"}`}
          aria-expanded={isOpen} onClick={toggle}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        {editingId === node.id ? <div className={`${styles.item} ${styles.treeLabel}`} data-workspace-editing>
          <span className={styles.icon}>{icon}</span>
          <InlineName node={node} onSave={onRenameNode} onClose={() => setEditingId(null)} />
        </div> : isFolder ? <div className={`${styles.item} ${styles.treeLabel}`} role="button" tabIndex={0} title={node.name}
          onClick={toggle} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}>
          <span className={styles.icon}>{icon}</span><span className={styles.itemLabel}>{node.name}</span>
        </div> : <NavLink to={`/project/${node.id}`} draggable={false} title={node.name}
          className={`${styles.item} ${styles.treeLabel} ${activeProjectId === node.id ? styles.active : ""}`}
          onClick={(event) => { if (draggingPaperId) event.preventDefault(); setOpenMenuId(null); }}>
          <span className={styles.icon}>{icon}</span><span className={styles.itemLabel}>{node.name}</span>
        </NavLink>}
        <button type="button" className={`${styles.projectMenuButton} ${menuOpen ? styles.projectMenuButtonOpen : ""}`}
          aria-label={`「${node.name}」のメニュー`} aria-haspopup="menu" aria-expanded={menuOpen}
          onClick={() => { setOpenMenuId(menuOpen ? null : node.id); setConfirmDeleteId(null); setMenuError(""); }}><MoreHorizontal size={16} /></button>
        {menuOpen && <div className={styles.projectMenu} role="menu">
          {confirmDeleteId === node.id ? <>
            <p className={styles.menuNotice}>「{node.name}」と配下の項目を削除しますか？論文ファイルは残ります。</p>
            <button role="menuitem" disabled={deleting} onClick={() => setConfirmDeleteId(null)}>キャンセル</button>
            <button role="menuitem" disabled={deleting} className={styles.projectMenuDanger}
              onClick={() => {
                setDeleting(true);
                void onDelete(node).then(() => setOpenMenuId(null)).catch((error: unknown) => {
                  const message = error instanceof Error ? error.message : "削除に失敗しました";
                  setMenuError(message);
                  showToast({ kind: "error", message });
                }).finally(() => setDeleting(false));
              }}>{deleting ? "削除中…" : "削除する"}</button>
          </> : <>
            <button role="menuitem" onClick={() => { setOpenMenuId(null); setEditingId(node.id); }}><Pencil size={14} />名称を変更</button>
            <button role="menuitem" disabled={!projectId} title={!projectId ? "論文の追加には Project 配下へ移動してください" : undefined}
              onClick={() => { setOpenMenuId(null); onAddPaper(node); }}><FilePlus2 size={14} />論文ファイルを追加</button>
            {!projectId && <p className={styles.menuNotice}>論文の追加には Project 配下へ移動してください</p>}
            <div className={styles.projectMenuSeparator} />
            <button role="menuitem" className={styles.projectMenuDanger} onClick={() => { setConfirmDeleteId(node.id); setMenuError(""); }}>
              <Trash2 size={14} />削除
            </button>
          </>}
          {menuError && <p role="alert" className={styles.menuNotice}>{menuError}</p>}
        </div>}
      </div>
      {isOpen && <div>
        {node.children.map((child) => renderNode(child, depth + 1))}
        {links.map((link) => {
          const paper = papers.find((item) => item.id === link.paperId);
          return paper ? <PaperItem key={link.paperId} paper={paper} depth={depth + 1} /> : null;
        })}
      </div>}
    </div>;
  };
  return <nav ref={treeRef} className={styles.nav} aria-label="ワークスペース"
    onClickCapture={drag.onClickCapture}>
    {tree.length ? tree.map((node) => renderNode(node, 0)) : <p className={`${styles.empty} ${styles.label}`}>研究テーマを追加</p>}
    <div data-workspace-id="root" className={`${styles.rootDrop} ${drag.dragging ? styles.rootDropVisible : ""} ${drag.drop?.id === "root" ? styles.dropinside : ""}`}>
      ルートへ移動
    </div>
  </nav>;
}

function PaperItem({ paper, depth }: { paper: Paper; depth: number }) {
  const label = paper.titleTranslated || paper.titleOriginal || "無題の論文";
  const drag = useDraggablePaper(paper.id, label);
  return <NavLink to={`/reader/${paper.id}`} title={label} draggable={false}
    className={`${styles.item} ${styles.treePaper}`}
    style={{ "--tree-indent": `${depth * 16}px` } as React.CSSProperties}
    onPointerDown={drag.onPointerDown} onDragStart={(event) => event.preventDefault()}
    onClick={(event) => { if (drag.consumeClickIfDragged()) event.preventDefault(); }}>
    <span className={styles.icon}><FileText size={14} /></span><span className={styles.itemLabel}>{label}</span>
  </NavLink>;
}

function InlineName({ node, onSave, onClose }: {
  node: WorkspaceNode;
  onSave: (node: WorkspaceNode, name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(node.name);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const cancelled = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  const save = async () => {
    if (busy.current || cancelled.current) return;
    const name = value.trim();
    if (!name) { setError("名前を入力してください"); input.current?.focus(); return; }
    if (name === node.name) { onClose(); return; }
    busy.current = true; setSaving(true);
    try { await onSave(node, name); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "変更に失敗しました"); }
    finally { busy.current = false; setSaving(false); }
  };
  return <div className={styles.inlineName}>
    <input ref={input} aria-label="名称" value={value} readOnly={saving}
      aria-invalid={Boolean(error)} onChange={(e) => { setValue(e.target.value); setError(""); }}
      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
      onBlur={() => void save()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === "Escape") { cancelled.current = true; onClose(); }
        if (e.key === "Enter") { e.preventDefault(); void save(); }
      }} />
    {error && <span role="alert">{error}</span>}
  </div>;
}
