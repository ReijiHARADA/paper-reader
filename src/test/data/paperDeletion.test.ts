import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../../data/fs/memoryFs";
import { createWorkspaceNode, addPaperToWorkspace, listAllWorkspacePapers } from "../../data/repositories/workspaceRepository";
import { deletePaperIndex, getPaperIndex } from "../../data/repositories/paperRepository";
import { openSqlite, type SqliteClient } from "../../data/sqlite/client";

describe("paper deletion", () => {
  let db: SqliteClient;

  beforeEach(async () => {
    db = await openSqlite(createMemoryFileSystem());
    createWorkspaceNode(db, { id: "workspace", name: "Workspace" });
    db.exec(
      "INSERT INTO papers (id, source_file_hash, processing_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      ["paper", "hash", "ready", "now", "now"]
    );
    addPaperToWorkspace(db, { nodeId: "workspace", paperId: "paper" });
  });

  it("removes the paper and its workspace membership", () => {
    deletePaperIndex(db, "paper");

    expect(getPaperIndex(db, "paper")).toBeUndefined();
    expect(listAllWorkspacePapers(db)).toEqual([]);
  });
});
