import { describe, expect, it } from "vitest";
import { assertMoveAllowed, buildWorkspaceTree, listChildWorkspaceNodes, reorderSiblings, wouldCreateCycle, workspaceAncestorPath } from "../../data/workspace/tree";
import type { WorkspaceNode } from "../../data/types/workspace";
const node = (id: string, parentId: string | null, order = 0): WorkspaceNode => ({ id, parentId, name: id, order, createdAt: "t", updatedAt: "t" });
describe("workspace tree", () => {
  it("nests one node type without depth limits", () => { const nodes = [node("a", null), node("b", "a"), node("c", "b"), node("d", "c")]; expect(buildWorkspaceTree(nodes)[0].children[0].children[0].children[0].id).toBe("d"); });
  it("allows any node under any node while rejecting cycles", () => { const nodes = [node("a", null), node("b", "a"), node("c", null)]; expect(() => assertMoveAllowed(nodes, "c", "b")).not.toThrow(); expect(wouldCreateCycle(nodes, "a", "b")).toBe(true); expect(() => assertMoveAllowed(nodes, "a", "b")).toThrow(/自分の子/); });
  it("reorders a shared sibling sequence", () => { const next = reorderSiblings([node("a", null, 0), node("b", null, 1)], null, ["b", "a"]); expect(next.map((item) => item.id)).toEqual(["b", "a"]); });
  it("lists direct child folders of a node", () => {
    const nodes = [node("a", null), node("b", "a", 1), node("c", "a", 0), node("d", "b")];
    expect(listChildWorkspaceNodes(nodes, "a").map((item) => item.id)).toEqual(["c", "b"]);
    expect(listChildWorkspaceNodes(nodes, "b").map((item) => item.id)).toEqual(["d"]);
    expect(listChildWorkspaceNodes(nodes, null).map((item) => item.id)).toEqual(["a"]);
  });
  it("builds the ancestor path from root to a nested folder", () => {
    const nodes = [node("a", null), node("b", "a"), node("c", "b")];
    expect(workspaceAncestorPath(nodes, "c").map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(workspaceAncestorPath(nodes, "a").map((item) => item.id)).toEqual(["a"]);
    expect(workspaceAncestorPath(nodes, "missing")).toEqual([]);
  });
});
