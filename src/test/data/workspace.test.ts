import { describe, expect, it } from "vitest";
import {
  assertMoveAllowed,
  buildWorkspaceTree,
  wouldCreateCycle,
  reorderSiblings,
} from "../../data/workspace/tree";
import type { WorkspaceNode } from "../../data/types/workspace";

function node(
  id: string,
  parentId: string | null,
  kind: WorkspaceNode["kind"],
  order = 0
): WorkspaceNode {
  return {
    id,
    parentId,
    kind,
    name: id,
    order,
    createdAt: "t",
    updatedAt: "t",
  };
}

describe("workspace tree", () => {
  it("nests folders and keeps projects as leaves", () => {
    const nodes = [
      node("root", null, "folder", 0),
      node("child", "root", "folder", 0),
      node("proj", "child", "project", 0),
      node("root-proj", null, "project", 1),
    ];
    const tree = buildWorkspaceTree(nodes);
    expect(tree.map((item) => item.id)).toEqual(["root", "root-proj"]);
    expect(tree[0].children[0].children[0].id).toBe("proj");
  });

  it("rejects cycles and project-under-project", () => {
    const nodes = [node("a", null, "folder"), node("b", "a", "folder"), node("p", "a", "project")];
    expect(wouldCreateCycle(nodes, "a", "b")).toBe(true);
    expect(() => assertMoveAllowed(nodes, "a", "b")).toThrow(/自分の子/);
    expect(() => assertMoveAllowed([...nodes, node("q", null, "project")], "q", "p")).toThrow(
      /Project/
    );
  });

  it("reorders siblings", () => {
    const nodes = [node("a", null, "project", 0), node("b", null, "project", 1)];
    const next = reorderSiblings(nodes, null, ["b", "a"]);
    expect(next.filter((item) => item.parentId === null).map((item) => item.id)).toEqual([
      "b",
      "a",
    ]);
  });
});
