import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Clock,
  Folder,
  Inbox,
  Library,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import type { Project } from "../../types/project";
import styles from "./AppSidebar.module.css";

type AppSidebarProps = {
  projects: Project[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onNewProject: () => void;
  onDeleteProject: (project: Project) => void;
  activeProjectId?: string | null;
  inboxCount: number;
};

export function AppSidebar({
  projects,
  searchQuery,
  onSearchChange,
  onNewProject,
  onDeleteProject,
  activeProjectId,
  inboxCount,
}: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleSearchFocus = () => {
    if (location.pathname.startsWith("/reader")) {
      navigate("/");
    }
  };

  return (
    <aside className={styles.sidebar}>
      {/* 検索 */}
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

      {/* New Project */}
      <button type="button" className={styles.newProject} onClick={onNewProject} title="New Project">
        <Plus size={16} className={styles.icon} />
        <span className={styles.label}>New Project</span>
      </button>

      {/* Projects */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.label}>Projects</span>
        </h2>
        {projects.length === 0 && (
          <p className={`${styles.empty} ${styles.label}`}>研究テーマを追加</p>
        )}
        <nav className={styles.nav}>
          {projects.map((project) => (
            <div
              key={project.id}
              className={`${styles.projectRow} ${
                activeProjectId === project.id ? styles.projectRowActive : ""
              }`}
            >
              <NavLink
                to={`/project/${project.id}`}
                className={({ isActive }) =>
                  `${styles.item} ${isActive || activeProjectId === project.id ? styles.active : ""}`
                }
                title={project.name}
              >
                <Folder size={16} className={styles.icon} />
                <span className={styles.itemLabel}>{project.name}</span>
              </NavLink>
              <button
                type="button"
                className={styles.delete}
                title="Project を削除"
                onClick={() => onDeleteProject(project)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </nav>
      </section>

      {/* Library */}
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
          />
          <LibItem to="/favorites" icon={<Star size={16} />} label="Favorites" />
          <LibItem to="/recent" icon={<Clock size={16} />} label="Recently Read" />
        </nav>
      </section>
    </aside>
  );
}

function LibItem({
  to,
  end,
  icon,
  label,
  badge,
}: {
  to: string;
  end?: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ""}`}
      title={label}
    >
      <span className={styles.icon}>{icon}</span>
      <span className={styles.itemLabel}>{label}</span>
      {badge !== undefined && <span className={styles.badge}>{badge}</span>}
    </NavLink>
  );
}
