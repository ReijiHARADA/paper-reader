import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Clock,
  Folder,
  Inbox,
  Library,
  Plus,
  Search,
  Settings,
  Star,
} from "lucide-react";
import type { WorkspaceNode } from "../../types/project";
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
  onNewProject: () => void;
  onNewFolder: () => void;
  onDeleteNode: (node: WorkspaceNode) => void;
  activeProjectId?: string | null;
  inboxCount: number;
};

export function AppSidebar({
  workspaceNodes,
  searchQuery,
  onSearchChange,
  onNewProject,
  onNewFolder,
  onDeleteNode,
  activeProjectId,
  inboxCount,
}: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarRef = useRef<HTMLElement>(null);
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

  const handleSearchFocus = () => {
    if (location.pathname.startsWith("/reader")) {
      navigate("/");
    }
  };

  return (
    <aside
      ref={sidebarRef}
      className={`${styles.sidebar} ${pointerOverSidebar ? styles.sidebarDropReady : ""}`}
    >
      <label className={styles.search} title="Search">
        <Search size={16} className={styles.searchIcon} />
        <input
          type="search"
          placeholder="Search"
          value={searchQuery}
          onFocus={handleSearchFocus}
          onChange={(e) => onSearchChange(e.target.value)}
          className={styles.searchInput}
          tabIndex={-1}
        />
      </label>

      <button type="button" className={styles.newProject} onClick={onNewProject} title="New Project">
        <Plus size={16} className={styles.icon} />
        <span className={styles.label}>New Project</span>
      </button>
      <button type="button" className={styles.newProject} onClick={onNewFolder} title="New Folder">
        <Folder size={16} className={styles.icon} />
        <span className={styles.label}>New Folder</span>
      </button>

      <div className={styles.scroll}>
        <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.label}>Projects</span>
        </h2>
        <WorkspaceTree
          nodes={workspaceNodes}
          activeProjectId={activeProjectId}
          dropTargetId={dropTargetId}
          draggingPaperId={draggingPaperId}
          onDelete={onDeleteNode}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.label}>Library</span>
        </h2>
        <nav className={styles.nav}>
          <LibItem to="/" end icon={<Library size={16} />} label="All Papers" />
          <LibItem
            to="/inbox"
            icon={<Inbox size={16} />}
            label="Inbox"
            badge={inboxCount > 0 ? inboxCount : undefined}
            inboxDrop
            dropTarget={dropTargetId === INBOX_DROP_ID}
            preventNav={Boolean(draggingPaperId)}
          />
          <LibItem to="/favorites" icon={<Star size={16} />} label="Favorites" />
          <LibItem to="/recent" icon={<Clock size={16} />} label="Recently Read" />
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
          <span className={styles.icon}>
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
      <span className={styles.icon}>{icon}</span>
      <span className={styles.itemLabel}>{label}</span>
      {badge !== undefined && <span className={styles.badge}>{badge}</span>}
    </NavLink>
  );
}
