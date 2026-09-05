import { v4 as uuidv4 } from "uuid";
import type { Project, ProjectPaper } from "../../types/project";
import type { SqliteClient } from "../sqlite/client";
import type { WorkspaceNode } from "../types/workspace";
import {
  assertMoveAllowed,
  owningProjectId,
  nextSiblingOrder,
  reorderSiblings,
} from "../workspace/tree";

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToNode(row: Record<string, unknown>): WorkspaceNode {
  return {
    id: String(row.id),
    parentId: row.parent_id == null ? null : String(row.parent_id),
    kind: String(row.kind) as WorkspaceNode["kind"],
    name: String(row.name),
    order: Number(row.sort_order),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listWorkspaceNodes(db: SqliteClient): WorkspaceNode[] {
  return db.query("SELECT * FROM workspace_nodes").map(rowToNode);
}

export function getWorkspaceNode(db: SqliteClient, id: string): WorkspaceNode | undefined {
  const row = db.get("SELECT * FROM workspace_nodes WHERE id = ?", [id]);
  return row ? rowToNode(row) : undefined;
}

function writeNode(db: SqliteClient, node: WorkspaceNode): void {
  db.exec(
    `INSERT INTO workspace_nodes (id, parent_id, kind, name, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       parent_id=excluded.parent_id,
       kind=excluded.kind,
       name=excluded.name,
       sort_order=excluded.sort_order,
       updated_at=excluded.updated_at`,
    [node.id, node.parentId, node.kind, node.name, node.order, node.createdAt, node.updatedAt]
  );
}

export function createWorkspaceNode(
  db: SqliteClient,
  input: {
    kind: WorkspaceNode["kind"];
    name: string;
    parentId?: string | null;
    id?: string;
    createdAt?: string;
    updatedAt?: string;
  }
): WorkspaceNode {
  const nodes = listWorkspaceNodes(db);
  const stamp = nowIso();
  const node: WorkspaceNode = {
    id: input.id ?? uuidv4(),
    parentId: input.parentId ?? null,
    kind: input.kind,
    name: input.name.trim(),
    order: nextSiblingOrder(nodes, input.parentId ?? null),
    createdAt: input.createdAt ?? stamp,
    updatedAt: input.updatedAt ?? stamp,
  };
  if (!node.name) throw new Error("名前を入力してください");
  if (nodes.some((item) => item.id === node.id)) throw new Error("Workspace node already exists");
  assertMoveAllowed([...nodes, { ...node, parentId: null }], node.id, node.parentId);
  writeNode(db, node);
  return node;
}

export function renameWorkspaceNode(db: SqliteClient, id: string, name: string): WorkspaceNode {
  const node = getWorkspaceNode(db, id);
  if (!node) throw new Error("Workspace node not found");
  if (!name.trim()) throw new Error("名前を入力してください");
  const next = { ...node, name: name.trim(), updatedAt: nowIso() };
  writeNode(db, next);
  return next;
}

export function moveWorkspaceNode(
  db: SqliteClient,
  id: string,
  parentId: string | null,
  order?: number
): WorkspaceNode {
  const nodes = listWorkspaceNodes(db);
  assertMoveAllowed(nodes, id, parentId);
  const node = nodes.find((item) => item.id === id);
  if (!node) throw new Error("Workspace node not found");
  const next = {
    ...node,
    parentId,
    order: nextSiblingOrder(nodes, parentId),
    updatedAt: nowIso(),
  };
  const siblings = nodes.filter((item) => item.parentId === parentId && item.id !== id)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const index = order === undefined ? siblings.length : Math.max(0, Math.min(siblings.length, Math.trunc(order)));
  if (!Number.isFinite(index)) throw new Error("Invalid order");
  siblings.splice(index, 0, next);
  db.transaction(() => {
    siblings.forEach((item, position) => writeNode(db, { ...item, order: position }));
    // A folder crossing a project boundary must not take that project's links with it.
    const updated = listWorkspaceNodes(db);
    for (const link of listAllProjectPapers(db)) {
      if (link.folderId && owningProjectId(updated, link.folderId) !== link.projectId) {
        saveProjectPaperRow(db, { ...link, folderId: null, updatedAt: nowIso() });
      }
    }
  });
  return { ...next, order: index };
}

export function reorderWorkspaceSiblings(
  db: SqliteClient,
  parentId: string | null,
  orderedIds: string[]
): void {
  const next = reorderSiblings(listWorkspaceNodes(db), parentId, orderedIds);
  for (const node of next.filter((item) => item.parentId === parentId)) {
    writeNode(db, { ...node, updatedAt: nowIso() });
  }
}

export function deleteWorkspaceNode(db: SqliteClient, id: string): string[] {
  const nodes = listWorkspaceNodes(db);
  const stack = [id];
  const removed: string[] = [];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    removed.push(current);
    for (const child of nodes.filter((node) => node.parentId === current)) {
      stack.push(child.id);
    }
  }
  db.transaction(() => {
  for (const nodeId of removed) {
    db.exec("DELETE FROM project_papers WHERE project_id = ?", [nodeId]);
    db.exec("DELETE FROM projects WHERE id = ?", [nodeId]);
    db.exec("DELETE FROM workspace_nodes WHERE id = ?", [nodeId]);
  }
  });
  return removed;
}

export function upsertProjectMeta(
  db: SqliteClient,
  project: Pick<Project, "id" | "description" | "researchQuestion" | "keywords">
): void {
  db.exec(
    `INSERT INTO projects (id, description, research_question, keywords_json)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       description=excluded.description,
       research_question=excluded.research_question,
       keywords_json=excluded.keywords_json`,
    [
      project.id,
      project.description ?? null,
      project.researchQuestion ?? null,
      project.keywords ? JSON.stringify(project.keywords) : null,
    ]
  );
}

export function listProjectsFromNodes(db: SqliteClient): Project[] {
  const nodes = listWorkspaceNodes(db).filter((node) => node.kind === "project");
  return nodes
    .map((node) => {
      const meta = db.get("SELECT * FROM projects WHERE id = ?", [node.id]);
      return {
        id: node.id,
        name: node.name,
        description: meta?.description ? String(meta.description) : undefined,
        researchQuestion: meta?.research_question ? String(meta.research_question) : undefined,
        keywords: parseJson<string[]>(meta?.keywords_json, undefined as unknown as string[]),
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      } satisfies Project;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getProjectFromNodes(db: SqliteClient, id: string): Project | undefined {
  return listProjectsFromNodes(db).find((project) => project.id === id);
}

function rowToLink(row: Record<string, unknown>): ProjectPaper {
  return {
    projectId: String(row.project_id),
    paperId: String(row.paper_id),
    folderId: row.folder_id == null ? null : String(row.folder_id),
    order: Number(row.sort_order ?? 0),
    note: row.note ? String(row.note) : undefined,
    relevance: row.relevance == null ? undefined : Number(row.relevance),
    status: row.status ? (String(row.status) as ProjectPaper["status"]) : undefined,
    decision: row.decision ? (String(row.decision) as ProjectPaper["decision"]) : undefined,
    tags: parseJson<string[]>(row.tags_json, undefined as unknown as string[]),
    quotes: parseJson<string[]>(row.quotes_json, undefined as unknown as string[]),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function saveProjectPaperRow(db: SqliteClient, link: ProjectPaper): void {
  const nodes = listWorkspaceNodes(db);
  if (nodes.find((node) => node.id === link.projectId)?.kind !== "project") throw new Error("Project not found");
  if (link.folderId && (nodes.find((node) => node.id === link.folderId)?.kind !== "folder" ||
      owningProjectId(nodes, link.folderId) !== link.projectId)) {
    throw new Error("論文は同じプロジェクト内のフォルダに配置してください");
  }
  db.exec(
    `INSERT INTO project_papers (
      project_id, paper_id, folder_id, sort_order, note, relevance, status, decision, tags_json, quotes_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, paper_id) DO UPDATE SET
      folder_id=excluded.folder_id,
      sort_order=excluded.sort_order,
      note=excluded.note,
      relevance=excluded.relevance,
      status=excluded.status,
      decision=excluded.decision,
      tags_json=excluded.tags_json,
      quotes_json=excluded.quotes_json,
      updated_at=excluded.updated_at`,
    [
      link.projectId,
      link.paperId,
      link.folderId ?? null,
      link.order ?? 0,
      link.note ?? null,
      link.relevance ?? null,
      link.status ?? null,
      link.decision ?? null,
      link.tags ? JSON.stringify(link.tags) : null,
      link.quotes ? JSON.stringify(link.quotes) : null,
      link.createdAt,
      link.updatedAt,
    ]
  );
}

export function getProjectPaperRow(
  db: SqliteClient,
  projectId: string,
  paperId: string
): ProjectPaper | undefined {
  const row = db.get(
    "SELECT * FROM project_papers WHERE project_id = ? AND paper_id = ?",
    [projectId, paperId]
  );
  return row ? rowToLink(row) : undefined;
}

export function listProjectPapersByProject(db: SqliteClient, projectId: string): ProjectPaper[] {
  return db.query("SELECT * FROM project_papers WHERE project_id = ?", [projectId]).map(rowToLink);
}

export function listProjectPapersByPaper(db: SqliteClient, paperId: string): ProjectPaper[] {
  return db.query("SELECT * FROM project_papers WHERE paper_id = ?", [paperId]).map(rowToLink);
}

export function listAllProjectPapers(db: SqliteClient): ProjectPaper[] {
  return db.query("SELECT * FROM project_papers").map(rowToLink);
}

export function deleteProjectPaperRow(db: SqliteClient, projectId: string, paperId: string): void {
  db.exec("DELETE FROM project_papers WHERE project_id = ? AND paper_id = ?", [projectId, paperId]);
}

/** Update placement only; preserve the target project's research metadata. */
export function placeProjectPaper(db: SqliteClient, paperId: string, targetId: string): ProjectPaper {
  const nodes = listWorkspaceNodes(db);
  const projectId = owningProjectId(nodes, targetId);
  if (!projectId) throw new Error("論文はプロジェクト内に配置してください");
  const folderId = targetId === projectId ? null : targetId;
  const existing = getProjectPaperRow(db, projectId, paperId);
  if (existing && (existing.folderId ?? null) === folderId) return existing;
  const order = listProjectPapersByProject(db, projectId)
    .filter((link) => (link.folderId ?? null) === folderId)
    .reduce((max, link) => Math.max(max, link.order ?? 0), -1) + 1;
  const stamp = nowIso();
  const link: ProjectPaper = { ...existing, projectId, paperId, folderId, order,
    status: existing?.status ?? "unread", createdAt: existing?.createdAt ?? stamp, updatedAt: stamp };
  saveProjectPaperRow(db, link);
  return link;
}
