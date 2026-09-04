import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAppStore, usePaperDataStore } from "../../stores/appStore";
import { useProjectStore } from "../../stores/projectStore";
import {
  getAllPapers,
  getAllProjectPapers,
  getAllProjects,
  getBlocksByPaper,
  getSectionsByPaper,
} from "../../services/database";
import {
  createProject,
  removeProject,
} from "../../services/projectService";
import {
  mergePreferTranslated,
  mergePreferTranslatedSections,
} from "../../utils/mergePaperData";
import { AppSidebar } from "./AppSidebar";
import { NewProjectModal } from "../project/NewProjectModal";
import type { Project } from "../../types/project";
import styles from "./AppShell.module.css";

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { paperId } = useParams<{ paperId?: string }>();
  const addPaper = useAppStore((state) => state.addPaper);
  const setSections = usePaperDataStore((state) => state.setSections);
  const setBlocks = usePaperDataStore((state) => state.setBlocks);
  const {
    projects,
    memberships,
    searchQuery,
    loaded,
    setLoaded,
    setSearchQuery,
    setProjects,
    setMemberships,
    upsertProject,
    removeProjectLocal,
  } = useProjectStore();

  const [showNewProject, setShowNewProject] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [dbPapers, dbProjects, dbLinks] = await Promise.all([
          getAllPapers(),
          getAllProjects(),
          getAllProjectPapers(),
        ]);
        if (cancelled) return;
        setProjects(dbProjects);
        setMemberships(dbLinks);
        for (const paper of dbPapers) {
          addPaper(paper);
          const [sections, blocks] = await Promise.all([
            getSectionsByPaper(paper.id),
            getBlocksByPaper(paper.id),
          ]);
          if (cancelled) return;
          setSections(paper.id, (prev) =>
            mergePreferTranslatedSections(prev, sections)
          );
          setBlocks(paper.id, (prev) => mergePreferTranslated(prev, blocks));
        }
      } catch (error) {
        console.error("Failed to load library:", error);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [addPaper, setBlocks, setLoaded, setMemberships, setProjects, setSections]);

  const searchParams = new URLSearchParams(location.search);
  const queryProjectId = searchParams.get("project");
  const routeProjectId = location.pathname.startsWith("/project/")
    ? location.pathname.slice("/project/".length).split("/")[0]
    : null;

  const readerProjectId = useMemo(() => {
    if (!paperId) return queryProjectId;
    if (queryProjectId) return queryProjectId;
    const links = memberships.filter((link) => link.paperId === paperId);
    return links.length === 1 ? links[0].projectId : queryProjectId;
  }, [memberships, paperId, queryProjectId]);

  const inboxCount = useMemo(() => {
    const assigned = new Set(memberships.map((link) => link.paperId));
    return useAppStore.getState().papers.filter((paper) => !assigned.has(paper.id))
      .length;
  }, [memberships, loaded]);

  const handleCreate = async (input: { name: string; description?: string }) => {
    const project = await createProject(input);
    upsertProject(project);
    navigate(`/project/${project.id}`);
  };

  const handleDelete = async (project: Project) => {
    if (!confirm(`「${project.name}」を削除しますか？論文自体は残ります。`)) {
      return;
    }
    await removeProject(project.id);
    removeProjectLocal(project.id);
    if (routeProjectId === project.id) {
      navigate("/inbox");
    }
  };

  return (
    <div className={styles.shell}>
      <AppSidebar
        projects={projects}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onNewProject={() => setShowNewProject(true)}
        onDeleteProject={handleDelete}
        activeProjectId={readerProjectId ?? routeProjectId}
        inboxCount={inboxCount}
      />
      <div className={styles.main}>
        <Outlet context={{ openNewProject: () => setShowNewProject(true) }} />
      </div>
      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
