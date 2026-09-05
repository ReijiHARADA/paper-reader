import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useLibraryCache } from "../../stores/libraryCache";
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
  createFolder,
  addPaperToProject,
  DuplicateProjectPaperError,
  removePaperFromAllProjects,
  listWorkspace,
  removeWorkspaceItem,
  updateProject,
} from "../../services/projectService";
import { tryStartPdfImport } from "../../services/pdfImport";
import type { WorkspaceNode } from "../../types/project";
import {
  mergePreferTranslated,
  mergePreferTranslatedSections,
} from "../../utils/mergePaperData";
import { AppSidebar } from "./AppSidebar";
import { PaperDragPreview } from "./PaperDragPreview";
import { NewProjectModal } from "../project/NewProjectModal";
import { setPaperDropHandler, INBOX_DROP_ID, usePaperDragStore } from "../../stores/paperDragStore";
import { useToastStore } from "../../stores/toastStore";
import { displayProcessingStatus } from "../../services/paperStatus";
import { isRetryableTranslationFailure } from "../../services/importServiceV2";
import styles from "./AppShell.module.css";

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { paperId } = useParams<{ paperId?: string }>();
  const setPapers = useLibraryCache((state) => state.setPapers);
  const updatePaper = useLibraryCache((state) => state.updatePaper);
  const setSections = useLibraryCache((state) => state.setSections);
  const setBlocks = useLibraryCache((state) => state.setBlocks);
  const projects = useProjectStore((state) => state.projects);
  const workspaceNodes = useProjectStore((state) => state.workspaceNodes);
  const memberships = useProjectStore((state) => state.memberships);
  const searchQuery = useProjectStore((state) => state.searchQuery);
  const setLoaded = useProjectStore((state) => state.setLoaded);
  const setSearchQuery = useProjectStore((state) => state.setSearchQuery);
  const mergeProjects = useProjectStore((state) => state.mergeProjects);
  const mergeWorkspaceNodes = useProjectStore((state) => state.mergeWorkspaceNodes);
  const setMemberships = useProjectStore((state) => state.setMemberships);
  const upsertProject = useProjectStore((state) => state.upsertProject);
  const upsertWorkspaceNode = useProjectStore((state) => state.upsertWorkspaceNode);
  const upsertMembership = useProjectStore((state) => state.upsertMembership);
  const removeMembershipsForPaper = useProjectStore(
    (state) => state.removeMembershipsForPaper
  );
  const removeWorkspaceNodesLocal = useProjectStore(
    (state) => state.removeWorkspaceNodesLocal
  );

  const showToast = usePaperDragStore((state) => state.showToast);
  const toast = useToastStore((state) => state.toast);
  const clearToast = useToastStore((state) => state.clearToast);
  const [createKind, setCreateKind] = useState<null | "project" | "folder">(null);
  const [renamingProject, setRenamingProject] = useState<WorkspaceNode | null>(null);
  const [fileProjectId, setFileProjectId] = useState<string | null>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [dbPapers, dbProjects, dbLinks, dbNodes] = await Promise.all([
          getAllPapers(),
          getAllProjects(),
          getAllProjectPapers(),
          listWorkspace(),
        ]);
        if (cancelled) return;
        // A project can be created while the initial SQLite reads are in flight.
        // Preserve those local cache updates instead of replacing them with the
        // older snapshot returned by the reads.
        mergeProjects(dbProjects);
        mergeWorkspaceNodes(dbNodes);
        setMemberships(dbLinks);
        setPapers(dbPapers);
        for (const paper of dbPapers) {
          const [sections, blocks] = await Promise.all([
            getSectionsByPaper(paper.id),
            getBlocksByPaper(paper.id),
          ]);
          if (cancelled) return;
          if (!useLibraryCache.getState().papers.some((item) => item.id === paper.id)) {
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
  }, [mergeProjects, mergeWorkspaceNodes, setBlocks, setLoaded, setMemberships, setPapers, setSections, updatePaper]);

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

  const papers = useLibraryCache((state) => state.papers);
  const inboxCount = useMemo(() => {
    const assigned = new Set(memberships.map((link) => link.paperId));
    return papers.filter((paper) => !assigned.has(paper.id)).length;
  }, [memberships, papers]);

  const handleCreate = async (input: { name: string; description?: string }) => {
    const project = await createProject(input);
    upsertProject(project);
    const nodes = await listWorkspace();
    mergeWorkspaceNodes(nodes);
    navigate(`/project/${project.id}`);
  };

  const handleCreateFolder = async (input: { name: string }) => {
    const folder = await createFolder(input.name);
    upsertWorkspaceNode(folder);
  };

  const handleRenameProject = async (input: { name: string }) => {
    if (!renamingProject) return;
    const project = await updateProject(renamingProject.id, { name: input.name });
    upsertProject(project);
    upsertWorkspaceNode({
      ...renamingProject,
      name: project.name,
      updatedAt: project.updatedAt,
    });
    setRenamingProject(null);
  };

  const handleAddPaperFromSidebar = (node: WorkspaceNode) => {
    setFileProjectId(node.id);
    projectFileInputRef.current?.click();
  };

  const handleDeleteNode = async (node: WorkspaceNode) => {
    const childCount = workspaceNodes.filter((item) => item.parentId === node.id).length;
    const message =
      node.kind === "folder" && childCount > 0
        ? `フォルダ「${node.name}」とその中の ${childCount} 件を削除しますか？論文ファイルは消えません。`
        : `「${node.name}」を削除しますか？`;
    if (!window.confirm(message)) return;
    const removed = await removeWorkspaceItem(node.id);
    removeWorkspaceNodesLocal(removed);
    if (node.kind === "project" && location.pathname.includes(node.id)) {
      navigate("/inbox");
    }
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("library-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const outletContext = useMemo(
    () => ({ openNewProject: () => setCreateKind("project") }),
    []
  );

  return (
    <div className={styles.shell}>
      <input
        ref={projectFileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className={styles.hiddenInput}
        onChange={(event) => {
          const file = event.target.files?.[0];
          const projectId = fileProjectId;
          if (file && projectId) void tryStartPdfImport(file, { projectId });
          event.target.value = "";
          setFileProjectId(null);
        }}
      />
      <AppSidebar
        workspaceNodes={workspaceNodes}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onNewProject={() => setCreateKind("project")}
        onNewFolder={() => setCreateKind("folder")}
        onDeleteNode={(node) => void handleDeleteNode(node)}
        onRenameProject={setRenamingProject}
        onAddPaperToProject={handleAddPaperFromSidebar}
        activeProjectId={readerProjectId ?? routeProjectId}
        inboxCount={inboxCount}
      />
      <div className={styles.main}>
        <Outlet context={outletContext} />
      </div>
      <PaperDragPreview />
      {toast && (
        <div
          className={`${styles.toast} ${
            toast.kind === "error"
              ? styles.toastError
              : toast.kind === "info"
                ? styles.toastInfo
                : styles.toastOk
          }`}
          role="status"
        >
          <span>{toast.message}</span>
          {toast.actionLabel && toast.onAction && (
            <button
              type="button"
              className={styles.toastAction}
              onClick={() => {
                toast.onAction?.();
                clearToast();
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
      {createKind === "project" && (
        <NewProjectModal
          onClose={() => setCreateKind(null)}
          onCreate={handleCreate}
        />
      )}
      {createKind === "folder" && (
        <NewProjectModal
          title="新規フォルダ"
          nameLabel="フォルダ名"
          onClose={() => setCreateKind(null)}
          onCreate={handleCreateFolder}
        />
      )}
      {renamingProject && (
        <NewProjectModal
          title="プロジェクト名を変更"
          nameLabel="プロジェクト名"
          initialName={renamingProject.name}
          submitLabel="変更を保存"
          showDescription={false}
          onClose={() => setRenamingProject(null)}
          onCreate={handleRenameProject}
        />
      )}
    </div>
  );
}
