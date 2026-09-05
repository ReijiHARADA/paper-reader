import type { Paper } from "../types/paper";
import type { WorkspaceNode } from "../types/project";
import type { WorkspacePaper } from "../types/project";
import { getStorage } from "../data/runtime";
import {
  addPaperToWorkspace as addPaperRow, createWorkspaceNode as createNodeRow, deleteWorkspaceNode,
  deleteWorkspacePaper, getWorkspaceNode, listAllWorkspacePapers, listWorkspaceNodes,
  movePaperInWorkspace as movePaperRow, moveWorkspaceNode, renameWorkspaceNode,
  reorderWorkspaceSiblings, updateWorkspaceNode,
} from "../data/repositories/workspaceRepository";
import { getAllPapers, getPaper } from "./database";
import { collectDescendantIds } from "../data/workspace/tree";

export type CreateWorkspaceNodeInput = Pick<WorkspaceNode, "name" | "parentId" | "description" | "researchQuestion" | "keywords">;
export async function createWorkspaceNode(input: CreateWorkspaceNodeInput): Promise<WorkspaceNode> { const { db } = await getStorage(); return createNodeRow(db, input); }
export async function updateWorkspaceNodeItem(id: string, updates: Partial<Pick<WorkspaceNode, "name" | "description" | "researchQuestion" | "keywords">>): Promise<WorkspaceNode> { const { db } = await getStorage(); return updateWorkspaceNode(db, id, updates); }
export async function renameWorkspaceItem(id: string, name: string): Promise<WorkspaceNode> { const { db } = await getStorage(); return renameWorkspaceNode(db, id, name); }
export async function moveWorkspaceItem(id: string, parentId: string | null, order?: number): Promise<WorkspaceNode> { const { db } = await getStorage(); return moveWorkspaceNode(db, id, parentId, order); }
export async function reorderWorkspaceItems(parentId: string | null, orderedIds: string[]): Promise<void> { const { db } = await getStorage(); reorderWorkspaceSiblings(db, parentId, orderedIds); }
export async function removeWorkspaceItem(id: string): Promise<string[]> { const { db } = await getStorage(); return deleteWorkspaceNode(db, id); }
export async function listWorkspace(): Promise<WorkspaceNode[]> { const { db } = await getStorage(); return listWorkspaceNodes(db); }
export async function getWorkspace(id: string): Promise<WorkspaceNode | undefined> { const { db } = await getStorage(); return getWorkspaceNode(db, id); }

export async function addPaperToWorkspace(nodeId: string, paperId: string): Promise<WorkspacePaper> { const { db } = await getStorage(); return addPaperRow(db, { nodeId, paperId, status: "unread" }); }
export async function movePaperInWorkspace(paperId: string, sourceNodeId: string, targetNodeId: string): Promise<WorkspacePaper> { const { db } = await getStorage(); return movePaperRow(db, paperId, sourceNodeId, targetNodeId); }
export async function removePaperFromWorkspace(nodeId: string, paperId: string): Promise<void> { const { db } = await getStorage(); deleteWorkspacePaper(db, nodeId, paperId); }
export async function removePaperFromAllWorkspaces(paperId: string): Promise<number> { const { db } = await getStorage(); const links = listAllWorkspacePapers(db).filter((link) => link.paperId === paperId); links.forEach((link) => deleteWorkspacePaper(db, link.nodeId, paperId)); return links.length; }
export async function listWorkspacePapers(): Promise<WorkspacePaper[]> { const { db } = await getStorage(); return listAllWorkspacePapers(db); }
export async function listPapersForWorkspace(nodeId: string): Promise<Paper[]> {
  const { db } = await getStorage(); const ids = new Set([nodeId, ...collectDescendantIds(listWorkspaceNodes(db), nodeId)]);
  const links = listAllWorkspacePapers(db).filter((link) => ids.has(link.nodeId));
  const papers = await Promise.all([...new Set(links.map((link) => link.paperId))].map(getPaper));
  return papers.filter((paper): paper is Paper => Boolean(paper));
}
export async function listInboxPapers(): Promise<Paper[]> { const [papers, links] = await Promise.all([getAllPapers(), listWorkspacePapers()]); const assigned = new Set(links.map((link) => link.paperId)); return papers.filter((paper) => !assigned.has(paper.id)); }
export const isPaperInInbox = (paperId: string, memberships: WorkspacePaper[]) => !memberships.some((link) => link.paperId === paperId);
