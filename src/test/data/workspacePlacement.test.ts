import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../../data/fs/memoryFs";
import { openSqlite, type SqliteClient } from "../../data/sqlite/client";
import { addPaperToWorkspace, createWorkspaceNode, deleteWorkspaceNode, getWorkspacePaper, listAllWorkspacePapers, listWorkspaceNodes, movePaperInWorkspace, moveWorkspaceNode, saveWorkspacePaper } from "../../data/repositories/workspaceRepository";
let db: SqliteClient;
beforeEach(async () => { db = await openSqlite(createMemoryFileSystem()); createWorkspaceNode(db, { id: "a", name: "A" }); createWorkspaceNode(db, { id: "b", name: "B", parentId: "a" }); createWorkspaceNode(db, { id: "c", name: "C", parentId: "b" }); db.exec("INSERT INTO papers (id, source_file_hash, processing_status, created_at, updated_at) VALUES ('paper', 'hash', 'ready', 't', 't')"); });
afterEach(async () => db.close());
describe("workspace nodes", () => {
  it("creates root and child nodes and moves freely", () => { const root = createWorkspaceNode(db, { name: "root" }); const child = createWorkspaceNode(db, { name: "child", parentId: root.id }); expect(child.parentId).toBe(root.id); expect(moveWorkspaceNode(db, "c", root.id).parentId).toBe(root.id); expect(moveWorkspaceNode(db, "c", null).parentId).toBeNull(); });
  it("rejects self and descendant moves only", () => { expect(() => moveWorkspaceNode(db, "a", "a")).toThrow(); expect(() => moveWorkspaceNode(db, "a", "c")).toThrow(); });
  it("reorders siblings", () => { moveWorkspaceNode(db, "c", null); moveWorkspaceNode(db, "a", null, 1); expect(listWorkspaceNodes(db).filter((node) => node.parentId === null).sort((x, y) => x.order - y.order).map((node) => node.id)).toEqual(["c", "a"]); });
});
describe("workspace papers", () => {
  it("adds to any node and preserves membership metadata", () => { const link = addPaperToWorkspace(db, { nodeId: "c", paperId: "paper", note: "memo", status: "reading", tags: ["tag"] }); expect(link.nodeId).toBe("c"); saveWorkspacePaper(db, { ...link, relevance: 0.8 }); expect(getWorkspacePaper(db, "c", "paper")).toMatchObject({ note: "memo", relevance: 0.8, tags: ["tag"] }); });
  it("moves only the placement, never the paper", () => { addPaperToWorkspace(db, { nodeId: "a", paperId: "paper" }); movePaperInWorkspace(db, "paper", "a", "c"); expect(getWorkspacePaper(db, "a", "paper")).toBeUndefined(); expect(getWorkspacePaper(db, "c", "paper")).toBeTruthy(); expect(db.query("SELECT id FROM papers")).toHaveLength(1); });
  it("removes memberships with a deleted subtree and keeps paper data", () => { addPaperToWorkspace(db, { nodeId: "c", paperId: "paper" }); deleteWorkspaceNode(db, "b"); expect(listAllWorkspacePapers(db)).toEqual([]); expect(db.query("SELECT id FROM papers")).toHaveLength(1); });
});
