import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAppStore, usePaperDataStore } from "../../stores/appStore";
import { useProjectStore } from "../../stores/projectStore";
import {
  getAllPapers,
  getAllProjectPapers,
  getAllProjects,
  getBlocksByPaper,
  getSectionsByPaper,
  savePaper,
} from "../../services/database";
import {
  createProject,
  addPaperToProject,
  DuplicateProjectPaperError,
  removePaperFromAllProjects,
} from "../../services/projectService";
import {
  mergePreferTranslated,
  mergePreferTranslatedSections,
} from "../../utils/mergePaperData";
import { AppSidebar } from "./AppSidebar";
import { PaperDragPreview } from "./PaperDragPreview";
import { NewProjectModal } from "../project/NewProjectModal";
import { setPaperDropHandler, INBOX_DROP_ID, usePaperDragStore } from "../../stores/paperDragStore";
import { displayProcessingStatus } from "../../services/paperStatus";
import { isRetryableTranslationFailure } from "../../services/importServiceV2";
import styles from "./AppShell.module.css";

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { paperId } = useParams<{ paperId?: string }>();
  const setPapers = useAppStore((state) => state.setPapers);
  const updatePaper = useAppStore((state) => state.updatePaper);
  const setSections = usePaperDataStore((state) => state.setSections);
  const setBlocks = usePaperDataStore((state) => state.setBlocks);
  const {
    projects,
    memberships,
    searchQuery,
    setLoaded,
    setSearchQuery,
    setProjects,
    setMemberships,
    upsertProject,
    upsertMembership,
    removeMembershipsForPaper,
  } = useProjectStore();

  const toast = usePaperDragStore((state) => state.toast);
  const showToast = usePaperDragStore((state) => state.showToast);
  const clearToast = usePaperDragStore((state) => state.clearToast);
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
        setPapers(dbPapers);
        for (const paper of dbPapers) {
          const [sections, blocks] = await Promise.all([
            getSectionsByPaper(paper.id),
            getBlocksByPaper(paper.id),
          ]);
          if (cancelled) return;
          if (!useAppStore.getState().papers.some((item) => item.id === paper.id)) {
            continue;
          }
          setSections(paper.id, (prev) =>
            mergePreferTranslatedSections(prev, sections)
          );
          setBlocks(paper.id, (prev) => mergePreferTranslated(prev, blocks));
          const nextStatus = displayProcessingStatus(
            paper.processingStatus,
            blocks,
            (block) => isRetryableTranslationFailure(block)
          );
          if (nextStatus !== paper.processingStatus) {
            await savePaper({ ...paper, processingStatus: nextStatus });
            updatePaper(paper.id, { processingStatus: nextStatus });
          }
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
  }, [setBlocks, setLoaded, setMemberships, setPapers, setProjects, setSections, updatePaper]);

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

  const papers = useAppStore((state) => state.papers);
  const inboxCount = useMemo(() => {
    const assigned = new Set(memberships.map((link) => link.paperId));
    return papers.filter((paper) => !assigned.has(paper.id)).length;
  }, [memberships, papers]);

  const handleCreate = async (input: { name: string; description?: string }) => {
    const project = await createProject(input);
    upsertProject(project);
    navigate(`/project/${project.id}`);
  };

  const handleDropPaper = useCallback(async (targetId: string, paperId: string) => {
    if (targetId === INBOX_DROP_ID) {
      const removed = await removePaperFromAllProjects(paperId);
      removeMembershipsForPaper(paperId);
      showToast({
        kind: removed > 0 ? "added" : "duplicate",
        message: removed > 0 ? "Inbox に戻しました" : "すでに Inbox にあります",
      });
      return;
    }

    const project = projects.find((item) => item.id === targetId);
    const projectName = project?.name ?? "このプロジェクト";
    const already = memberships.some(
      (link) => link.projectId === targetId && link.paperId === paperId
    );
    if (already) {
      showToast({
        kind: "duplicate",
        message: `「${projectName}」にはすでに入っています`,
      });
      return;
    }
    try {
      const link = await addPaperToProject({ projectId: targetId, paperId });
      upsertMembership(link);
      showToast({
        kind: "added",
        message: `「${projectName}」に追加しました`,
      });
    } catch (error) {
      if (error instanceof DuplicateProjectPaperError) {
        showToast({
          kind: "duplicate",
          message: `「${projectName}」にはすでに入っています`,
        });
        return;
      }
      console.error("Failed to add paper to project:", error);
      showToast({
        kind: "error",
        message: "プロジェクトへの追加に失敗しました",
      });
    }
  }, [memberships, projects, removeMembershipsForPaper, showToast, upsertMembership]);

  useEffect(() => {
    setPaperDropHandler(handleDropPaper);
    return () => setPaperDropHandler(null);
  }, [handleDropPaper]);

  return (
    <div className={styles.shell}>
      <AppSidebar
        projects={projects}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onNewProject={() => setShowNewProject(true)}
        activeProjectId={readerProjectId ?? routeProjectId}
        inboxCount={inboxCount}
      />
      <div className={styles.main}>
        <Outlet context={{ openNewProject: () => setShowNewProject(true) }} />
      </div>
      <PaperDragPreview />
      {toast && (
        <div
          className={`${styles.toast} ${
            toast.kind === "duplicate" || toast.kind === "error"
              ? styles.toastError
              : styles.toastOk
          }`}
          role="status"
          onClick={clearToast}
        >
          {toast.message}
        </div>
      )}
      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
