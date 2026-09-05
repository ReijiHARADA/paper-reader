import { beforeEach, describe, expect, it } from "vitest";
import { useProjectStore } from "../../stores/projectStore";
import type { Project, WorkspaceNode } from "../../types/project";

const stamp = "2026-09-05T00:00:00.000Z";

function project(id: string, name: string): Project {
  return { id, name, createdAt: stamp, updatedAt: stamp };
}

function projectNode(id: string, name: string): WorkspaceNode {
  return {
    id,
    kind: "project",
    name,
    parentId: null,
    position: 0,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

describe("projectStore initial hydration", () => {
  beforeEach(() => {
    useProjectStore.setState({
      projects: [],
      workspaceNodes: [],
      memberships: [],
      loaded: false,
    });
  });

  it("keeps a project created while the persisted project snapshot was loading", () => {
    const persisted = project("existing", "Existing");
    const created = project("created", "Created just now");

    useProjectStore.getState().upsertProject(created);
    useProjectStore.getState().mergeProjects([persisted]);

    expect(useProjectStore.getState().projects.map((item) => item.id)).toEqual([
      "created",
      "existing",
    ]);
  });

  it("keeps the matching sidebar node created while its snapshot was loading", () => {
    const persisted = projectNode("existing", "Existing");
    const created = projectNode("created", "Created just now");

    useProjectStore.getState().upsertWorkspaceNode(created);
    useProjectStore.getState().mergeWorkspaceNodes([persisted]);

    expect(useProjectStore.getState().workspaceNodes.map((item) => item.id)).toEqual([
      "existing",
      "created",
    ]);
  });
});
