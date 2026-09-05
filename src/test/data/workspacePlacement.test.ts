import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../../data/fs/memoryFs";
import { openSqlite, type SqliteClient } from "../../data/sqlite/client";
import { createWorkspaceNode, moveWorkspaceNode, listWorkspaceNodes, placeProjectPaper, getProjectPaperRow, saveProjectPaperRow, deleteWorkspaceNode } from "../../data/repositories/workspaceRepository";
import { PROJECT_NESTING_ERROR } from "../../data/workspace/tree";

let db: SqliteClient;
beforeEach(async () => {
  db = await openSqlite(createMemoryFileSystem());
  for (const [id, kind, parentId] of [
    ["p", "project", null], ["q", "project", null],
    ["a", "folder", null], ["b", "folder", "a"],
    ["x", "folder", "p"], ["y", "folder", "x"],
  ] as const) createWorkspaceNode(db, { id, kind, parentId, name: id });
  db.exec("INSERT INTO papers (id, source_file_hash, processing_status, created_at, updated_at) VALUES ('paper', 'hash', 'ready', 't', 't')");
});
afterEach(async () => { await db.close(); });

describe("workspace repository invariants", () => {
  it.each([["a", "x"], ["a", "p"], ["q", "a"]])("moves %s into %s", (id, parentId) => {
    expect(moveWorkspaceNode(db, id, parentId).parentId).toBe(parentId);
  });
  it.each([["q", "p"], ["q", "y"]])("rejects nested project %s into %s without changes", (id, parentId) => {
    const before = listWorkspaceNodes(db);
    expect(() => moveWorkspaceNode(db, id, parentId)).toThrow(PROJECT_NESTING_ERROR);
    expect(listWorkspaceNodes(db)).toEqual(before);
  });
  it("rejects a folder containing a project, including indirect placement", () => {
    moveWorkspaceNode(db, "q", "b");
    expect(() => moveWorkspaceNode(db, "a", "p")).toThrow(PROJECT_NESTING_ERROR);
    expect(() => moveWorkspaceNode(db, "a", "y")).toThrow(PROJECT_NESTING_ERROR);
  });
  it.each([["a", "a"], ["a", "b"]])("rejects self/descendant cycles", (id, parentId) => {
    expect(() => moveWorkspaceNode(db, id, parentId)).toThrow(/自分の子/);
  });
  it("validates creation and missing parents too", () => {
    expect(() => createWorkspaceNode(db, { kind: "project", name: "nested", parentId: "y" })).toThrow(PROJECT_NESTING_ERROR);
    expect(() => createWorkspaceNode(db, { kind: "folder", name: "orphan", parentId: "missing" })).toThrow();
  });
  it("reorders folders and projects in a shared sibling sequence", () => {
    moveWorkspaceNode(db, "a", null, 0);
    expect(listWorkspaceNodes(db).filter((n) => n.parentId === null).sort((a,b) => a.order-b.order).map((n) => n.id)).toEqual(["a", "p", "q"]);
    moveWorkspaceNode(db, "a", null, 2);
    expect(listWorkspaceNodes(db).filter((n) => n.parentId === null).sort((a,b) => a.order-b.order).map((n) => n.id)).toEqual(["p", "q", "a"]);
  });
});

describe("paper placement", () => {
  it("places at root, nested folders, another folder, and back while retaining all metadata", () => {
    const root = placeProjectPaper(db, "paper", "p");
    expect(root.folderId).toBeNull();
    const metadata = { note: "research note", relevance: 0.8, status: "reading" as const,
      decision: "adopt" as const, tags: ["tag"], quotes: ["quote"], createdAt: root.createdAt };
    saveProjectPaperRow(db, { ...root, ...metadata });
    for (const target of ["x", "y", "p"]) {
      const link = placeProjectPaper(db, "paper", target);
      expect(link).toMatchObject({ ...metadata, folderId: target === "p" ? null : target });
    }
    expect(db.query("SELECT * FROM papers")).toHaveLength(1);
    expect(db.query("SELECT * FROM project_papers")).toHaveLength(1);
  });
  it("keeps an identical placement unchanged", () => {
    const original = placeProjectPaper(db, "paper", "x");
    expect(placeProjectPaper(db, "paper", "x")).toEqual(original);
  });
  it("rejects placement outside projects or into a foreign project's folder", () => {
    expect(() => placeProjectPaper(db, "paper", "a")).toThrow();
    const link = placeProjectPaper(db, "paper", "q");
    expect(() => saveProjectPaperRow(db, { ...link, folderId: "x" })).toThrow();
  });
  it("preserves independent memberships across projects", () => {
    placeProjectPaper(db, "paper", "x");
    placeProjectPaper(db, "paper", "q");
    expect(getProjectPaperRow(db, "p", "paper")?.folderId).toBe("x");
    expect(db.query("SELECT * FROM papers")).toHaveLength(1);
  });
  it.each(["a", "q"])("returns placement to original project root when a folder crosses a project boundary", (target) => {
    placeProjectPaper(db, "paper", "y");
    moveWorkspaceNode(db, "x", target);
    expect(getProjectPaperRow(db, "p", "paper")?.folderId).toBeNull();
    expect(getProjectPaperRow(db, "q", "paper")).toBeUndefined();
  });
  it("preserves placement when moving a folder within its project", () => {
    placeProjectPaper(db, "paper", "y");
    moveWorkspaceNode(db, "y", "p");
    expect(getProjectPaperRow(db, "p", "paper")?.folderId).toBe("y");
  });
  it("deletes a folder without deleting membership or paper", () => {
    placeProjectPaper(db, "paper", "y");
    deleteWorkspaceNode(db, "x");
    expect(getProjectPaperRow(db, "p", "paper")?.folderId).toBeNull();
    expect(db.query("SELECT * FROM papers")).toHaveLength(1);
  });
});
