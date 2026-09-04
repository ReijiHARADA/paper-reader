import { create } from "zustand";
import type { Project, ProjectPaper } from "../types/project";

type ProjectState = {
  projects: Project[];
  memberships: ProjectPaper[];
  searchQuery: string;
  loaded: boolean;

  setLoaded: (loaded: boolean) => void;
  setSearchQuery: (query: string) => void;
  setProjects: (projects: Project[]) => void;
  upsertProject: (project: Project) => void;
  removeProjectLocal: (projectId: string) => void;
  setMemberships: (memberships: ProjectPaper[]) => void;
  upsertMembership: (link: ProjectPaper) => void;
  removeMembershipLocal: (projectId: string, paperId: string) => void;
};

export const useProjectStore = create<ProjectState>()((set) => ({
  projects: [],
  memberships: [],
  searchQuery: "",
  loaded: false,

  setLoaded: (loaded) => set({ loaded }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setProjects: (projects) => set({ projects }),
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
      memberships: state.memberships.filter((link) => link.projectId !== projectId),
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
}));
