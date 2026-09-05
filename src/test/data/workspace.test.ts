import { describe, expect, it } from "vitest";
import { assertMoveAllowed, buildWorkspaceTree, reorderSiblings, wouldCreateCycle } from "../../data/workspace/tree";
import type { WorkspaceNode } from "../../data/types/workspace";
const node = (id: string, parentId: string | null, order = 0): WorkspaceNode => ({ id, parentId, name: id, order, createdAt: "t", updatedAt: "t" });
describe("workspace tree", () => {
  it("nests one node type without depth limits", () => { const nodes = [node("a", null), node("b", "a"), node("c", "b"), node("d", "c")]; expect(buildWorkspaceTree(nodes)[0].children[0].children[0].children[0].id).toBe("d"); });
  it("allows any node under any node while rejecting cycles", () => { const nodes = [node("a", null), node("b", "a"), node("c", null)]; expect(() => assertMoveAllowed(nodes, "c", "b")).not.toThrow(); expect(wouldCreateCycle(nodes, "a", "b")).toBe(true); expect(() => assertMoveAllowed(nodes, "a", "b")).toThrow(/自分の子/); });
  it("reorders a shared sibling sequence", () => { const next = reorderSiblings([node("a", null, 0), node("b", null, 1)], null, ["b", "a"]); expect(next.map((item) => item.id)).toEqual(["b", "a"]); });
});
