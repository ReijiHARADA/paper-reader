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
import type { Project } from "../../types/project";
import {
  INBOX_DROP_ID,
  usePaperDragStore,
} from "../../stores/paperDragStore";
import styles from "./AppSidebar.module.css";

type AppSidebarProps = {
  projects: Project[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onNewProject: () => void;
  onOpenSettings: () => void;
  settingsOpen?: boolean;
  activeProjectId?: string | null;
  inboxCount: number;
};

export function AppSidebar({
  projects,
  searchQuery,
  onSearchChange,
  onNewProject,
  onOpenSettings,
  settingsOpen = false,
  activeProjectId,
  inboxCount,
}: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const draggingPaperId = usePaperDragStore((state) => state.draggingPaperId);
  const dropTargetId = usePaperDragStore((state) => state.dropTargetId);

  const handleSearchFocus = () => {
    if (location.pathname.startsWith("/reader")) {
      navigate("/");
    }
  };

  return (
    <aside className={`${styles.sidebar} ${draggingPaperId ? styles.sidebarDropReady : ""}`}>
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

      <div className={styles.scroll}>
        <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.label}>Projects</span>
        </h2>
        {projects.length === 0 && (
          <p className={`${styles.empty} ${styles.label}`}>研究テーマを追加</p>
        )}
        <nav className={styles.nav}>
          {projects.map((project) => (
            <NavLink
              key={project.id}
              to={`/project/${project.id}`}
              data-project-drop-id={project.id}
              className={({ isActive }) =>
                `${styles.item} ${
                  isActive || activeProjectId === project.id ? styles.active : ""
                } ${dropTargetId === project.id ? styles.dropTarget : ""}`
              }
              title={project.name}
              onClick={(event) => {
                if (draggingPaperId) event.preventDefault();
              }}
            >
              <span className={styles.icon}>
                <Folder size={16} />
              </span>
              <span className={styles.itemLabel}>{project.name}</span>
            </NavLink>
          ))}
        </nav>
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
        <button
          type="button"
          className={`${styles.item} ${styles.footerButton} ${settingsOpen ? styles.active : ""}`}
          title="設定"
          onClick={onOpenSettings}
        >
          <span className={styles.icon}>
            <Settings size={16} />
          </span>
          <span className={styles.itemLabel}>設定</span>
        </button>
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
