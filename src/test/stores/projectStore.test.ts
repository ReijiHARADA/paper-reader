import { beforeEach, describe, expect, it } from "vitest";
import { useProjectStore } from "../../stores/projectStore";
import type { WorkspaceNode } from "../../types/project";
const node = (id: string, name: string): WorkspaceNode => ({ id, name, parentId: null, order: 0, createdAt: "t", updatedAt: "t" });
describe("workspace store initial hydration", () => {
  beforeEach(() => useProjectStore.setState({ workspaceNodes: [], memberships: [], loaded: false }));
  it("keeps a node created while persisted nodes are loading", () => { useProjectStore.getState().upsertWorkspaceNode(node("created", "Created")); useProjectStore.getState().mergeWorkspaceNodes([node("existing", "Existing")]); expect(useProjectStore.getState().workspaceNodes.map((item) => item.id)).toEqual(["existing", "created"]); });
  it("upserts memberships by node and paper", () => { const link = { nodeId: "node", paperId: "paper", order: 0, createdAt: "t", updatedAt: "t" }; useProjectStore.getState().upsertMembership(link); useProjectStore.getState().upsertMembership({ ...link, order: 1 }); expect(useProjectStore.getState().memberships).toEqual([{ ...link, order: 1 }]); });
});
