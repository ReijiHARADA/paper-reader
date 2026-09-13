import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Clock,
  Inbox,
  Library,
  Plus,
  Search,
  Settings,
  Star,
} from "lucide-react";
import type { WorkspaceNode } from "../../types/project";
import { useAppStore } from "../../stores/appStore";
import {
  INBOX_DROP_ID,
  usePaperDragStore,
} from "../../stores/paperDragStore";
import { WorkspaceTree } from "./WorkspaceTree";
import styles from "./AppSidebar.module.css";

type AppSidebarProps = {
  workspaceNodes: WorkspaceNode[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onNewWorkspace: () => void;
  onNewChild: (node: WorkspaceNode) => void;
  onDeleteNode: (node: WorkspaceNode) => Promise<void>;
  onAddPaperToWorkspace: (node: WorkspaceNode) => void;
  activeNodeId?: string | null;
  inboxCount: number;
};

export function AppSidebar({
  workspaceNodes,
  searchQuery,
  onSearchChange,
  onNewWorkspace,
  onNewChild,
  onDeleteNode,
  onAddPaperToWorkspace,
  activeNodeId,
  inboxCount,
}: AppSidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarMode = useAppStore((state) => state.displaySettings.sidebarMode);
  const collapseRootsOnly = useAppStore(
    (state) => state.displaySettings.sidebarCollapseRootsOnly
  );
  const draggingPaperId = usePaperDragStore((state) => state.draggingPaperId);
  const dropTargetId = usePaperDragStore((state) => state.dropTargetId);
  const pointerX = usePaperDragStore((state) => state.pointerX);
  const pointerY = usePaperDragStore((state) => state.pointerY);
  const [pointerOverSidebar, setPointerOverSidebar] = useState(false);

  useEffect(() => {
    if (!draggingPaperId) {
      setPointerOverSidebar(false);
      return;
    }
    const el = sidebarRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPointerOverSidebar(
      pointerX >= rect.left &&
        pointerX <= rect.right &&
        pointerY >= rect.top &&
        pointerY <= rect.bottom
    );
  }, [draggingPaperId, pointerX, pointerY]);

  const modeClass =
    sidebarMode === "expanded"
      ? styles.sidebarExpanded
      : sidebarMode === "collapsed"
        ? styles.sidebarCollapsed
        : styles.sidebarAuto;

  return (
    <aside
      ref={sidebarRef}
      className={`${styles.sidebar} ${modeClass} ${pointerOverSidebar ? styles.sidebarDropReady : ""} ${collapseRootsOnly ? styles.sidebarRootsOnly : ""}`}
    >
      <label className={styles.search} title="ライブラリを検索 (⌘K)">
        <span className={styles.iconSlot}>
          <Search size={16} className={styles.searchIcon} />
        </span>
        <input
          id="library-search"
          type="search"
          placeholder="ライブラリを検索"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className={styles.searchInput}
        />
      </label>

      <button type="button" className={styles.newProject} onClick={onNewWorkspace} title="新規フォルダ">
        <span className={styles.iconSlot}>
          <Plus size={16} />
        </span>
        <span className={styles.label}>新規フォルダ</span>
      </button>

      <div className={styles.scroll}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.label}>ワークスペース</span>
          </h2>
          <WorkspaceTree
            nodes={workspaceNodes}
            activeNodeId={activeNodeId}
            dropTargetId={dropTargetId}
            draggingPaperId={draggingPaperId}
            onDelete={onDeleteNode}
            onNewChild={onNewChild}
            onAddPaper={onAddPaperToWorkspace}
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.label}>ライブラリ</span>
          </h2>
          <nav className={styles.nav}>
            <LibItem to="/" end icon={<Library size={16} />} label="すべての論文" />
            <LibItem
              to="/inbox"
              icon={<Inbox size={16} />}
              label="インボックス"
              badge={inboxCount > 0 ? inboxCount : undefined}
              inboxDrop
              dropTarget={dropTargetId === INBOX_DROP_ID}
              preventNav={Boolean(draggingPaperId)}
            />
            <LibItem to="/favorites" icon={<Star size={16} />} label="お気に入り" />
            <LibItem to="/recent" icon={<Clock size={16} />} label="最近読んだ論文" />
          </nav>
        </section>
      </div>

      <div className={styles.footer}>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `${styles.item} ${styles.footerButton} ${isActive ? styles.active : ""}`
          }
          title="設定"
          onClick={(event) => {
            if (draggingPaperId) event.preventDefault();
          }}
        >
          <span className={styles.iconSlot}>
            <Settings size={16} />
          </span>
          <span className={styles.itemLabel}>設定</span>
        </NavLink>
      </div>
    </aside>
  );
}

function LibItem({
  to,
  end,
  icon,
  label,
  badge,
  inboxDrop,
  dropTarget,
  preventNav,
}: {
  to: string;
  end?: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  inboxDrop?: boolean;
  dropTarget?: boolean;
  preventNav?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      data-inbox-drop={inboxDrop ? "" : undefined}
      className={({ isActive }) =>
        `${styles.item} ${isActive ? styles.active : ""} ${dropTarget ? styles.dropTarget : ""}`
      }
      title={label}
      onClick={(event) => {
        if (preventNav) event.preventDefault();
      }}
    >
      <span className={styles.iconSlot}>{icon}</span>
      <span className={styles.itemLabel}>{label}</span>
      {badge !== undefined && <span className={styles.badge}>{badge}</span>}
    </NavLink>
  );
}
