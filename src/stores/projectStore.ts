import { create } from "zustand";
import type { WorkspaceNode, WorkspacePaper } from "../types/project";

type WorkspaceState = {
  workspaceNodes: WorkspaceNode[];
  memberships: WorkspacePaper[];
  searchQuery: string;
  loaded: boolean;
  setLoaded: (loaded: boolean) => void;
  setSearchQuery: (query: string) => void;
  setWorkspaceNodes: (nodes: WorkspaceNode[]) => void;
  mergeWorkspaceNodes: (nodes: WorkspaceNode[]) => void;
  upsertWorkspaceNode: (node: WorkspaceNode) => void;
  removeWorkspaceNodesLocal: (ids: string[]) => void;
  setMemberships: (memberships: WorkspacePaper[]) => void;
  upsertMembership: (link: WorkspacePaper) => void;
  removeMembershipLocal: (nodeId: string, paperId: string) => void;
  removeMembershipsForPaper: (paperId: string) => void;
};
export const useProjectStore = create<WorkspaceState>()((set) => ({
  workspaceNodes: [], memberships: [], searchQuery: "", loaded: false,
  setLoaded: (loaded) => set({ loaded }), setSearchQuery: (searchQuery) => set({ searchQuery }),
  setWorkspaceNodes: (workspaceNodes) => set({ workspaceNodes }),
  mergeWorkspaceNodes: (persistedNodes) => set((state) => {
    const current = new Map(state.workspaceNodes.map((node) => [node.id, node]));
    const persistedIds = new Set(persistedNodes.map((node) => node.id));
    return { workspaceNodes: [...persistedNodes.map((node) => current.get(node.id) ?? node), ...state.workspaceNodes.filter((node) => !persistedIds.has(node.id))] };
  }),
  upsertWorkspaceNode: (node) => set((state) => ({ workspaceNodes: state.workspaceNodes.some((item) => item.id === node.id) ? state.workspaceNodes.map((item) => item.id === node.id ? node : item) : [...state.workspaceNodes, node] })),
  removeWorkspaceNodesLocal: (ids) => set((state) => ({ workspaceNodes: state.workspaceNodes.filter((item) => !ids.includes(item.id)), memberships: state.memberships.filter((link) => !ids.includes(link.nodeId)) })),
  setMemberships: (memberships) => set({ memberships }),
  upsertMembership: (link) => set((state) => ({ memberships: state.memberships.some((item) => item.nodeId === link.nodeId && item.paperId === link.paperId) ? state.memberships.map((item) => item.nodeId === link.nodeId && item.paperId === link.paperId ? link : item) : [...state.memberships, link] })),
  removeMembershipLocal: (nodeId, paperId) => set((state) => ({ memberships: state.memberships.filter((link) => !(link.nodeId === nodeId && link.paperId === paperId)) })),
  removeMembershipsForPaper: (paperId) => set((state) => ({ memberships: state.memberships.filter((link) => link.paperId !== paperId) })),
}));
