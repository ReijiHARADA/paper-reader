import { create } from "zustand";
import type { Project, ProjectPaper, WorkspaceNode } from "../types/project";

/** Query cache + Library search UI. SQLite remains the authority for memberships. */

type ProjectState = {
  projects: Project[];
  workspaceNodes: WorkspaceNode[];
  memberships: ProjectPaper[];
  searchQuery: string;
  loaded: boolean;

  setLoaded: (loaded: boolean) => void;
  setSearchQuery: (query: string) => void;
  setProjects: (projects: Project[]) => void;
  setWorkspaceNodes: (nodes: WorkspaceNode[]) => void;
  mergeProjects: (projects: Project[]) => void;
  mergeWorkspaceNodes: (nodes: WorkspaceNode[]) => void;
  upsertProject: (project: Project) => void;
  upsertWorkspaceNode: (node: WorkspaceNode) => void;
  removeProjectLocal: (projectId: string) => void;
  removeWorkspaceNodesLocal: (ids: string[]) => void;
  setMemberships: (memberships: ProjectPaper[]) => void;
  upsertMembership: (link: ProjectPaper) => void;
  removeMembershipLocal: (projectId: string, paperId: string) => void;
  removeMembershipsForPaper: (paperId: string) => void;
};

export const useProjectStore = create<ProjectState>()((set) => ({
  projects: [],
  workspaceNodes: [],
  memberships: [],
  searchQuery: "",
  loaded: false,

  setLoaded: (loaded) => set({ loaded }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setProjects: (projects) => set({ projects }),
  setWorkspaceNodes: (workspaceNodes) => set({ workspaceNodes }),
  mergeProjects: (persistedProjects) =>
    set((state) => {
      const currentById = new Map(state.projects.map((project) => [project.id, project]));
      const projects = persistedProjects.map(
        (project) => currentById.get(project.id) ?? project
      );
      const persistedIds = new Set(persistedProjects.map((project) => project.id));
      return {
        projects: [
          ...state.projects.filter((project) => !persistedIds.has(project.id)),
          ...projects,
        ],
      };
    }),
  mergeWorkspaceNodes: (persistedNodes) =>
    set((state) => {
      const currentById = new Map(state.workspaceNodes.map((node) => [node.id, node]));
      const workspaceNodes = persistedNodes.map((node) => currentById.get(node.id) ?? node);
      const persistedIds = new Set(persistedNodes.map((node) => node.id));
      return {
        workspaceNodes: [
          ...workspaceNodes,
          ...state.workspaceNodes.filter((node) => !persistedIds.has(node.id)),
        ],
      };
    }),
  upsertWorkspaceNode: (node) =>
    set((state) => {
      const exists = state.workspaceNodes.some((item) => item.id === node.id);
      return {
        workspaceNodes: exists
          ? state.workspaceNodes.map((item) => (item.id === node.id ? node : item))
          : [...state.workspaceNodes, node],
      };
    }),
  upsertProject: (project) =>
    set((state) => {
      const exists = state.projects.some((item) => item.id === project.id);
      const projects = exists
        ? state.projects.map((item) => (item.id === project.id ? project : item))
        : [project, ...state.projects];
      return { projects };
    }),
  removeProjectLocal: (projectId) =>
    set((state) => ({
      projects: state.projects.filter((item) => item.id !== projectId),
      workspaceNodes: state.workspaceNodes.filter((item) => item.id !== projectId),
      memberships: state.memberships.filter((link) => link.projectId !== projectId),
    })),
  removeWorkspaceNodesLocal: (ids) =>
    set((state) => ({
      workspaceNodes: state.workspaceNodes.filter((item) => !ids.includes(item.id)),
      projects: state.projects.filter((item) => !ids.includes(item.id)),
      memberships: state.memberships.filter((link) => !ids.includes(link.projectId)),
    })),
  setMemberships: (memberships) => set({ memberships }),
  upsertMembership: (link) =>
    set((state) => {
      const exists = state.memberships.some(
        (item) => item.projectId === link.projectId && item.paperId === link.paperId
      );
      const memberships = exists
        ? state.memberships.map((item) =>
            item.projectId === link.projectId && item.paperId === link.paperId
              ? link
              : item
          )
        : [...state.memberships, link];
      return { memberships };
    }),
  removeMembershipLocal: (projectId, paperId) =>
    set((state) => ({
      memberships: state.memberships.filter(
        (link) => !(link.projectId === projectId && link.paperId === paperId)
      ),
    })),
  removeMembershipsForPaper: (paperId) =>
    set((state) => ({
      memberships: state.memberships.filter((link) => link.paperId !== paperId),
    })),
}));
