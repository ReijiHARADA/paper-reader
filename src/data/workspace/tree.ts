import type { WorkspaceNode, WorkspaceTreeNode } from "../types/workspace";

export function buildWorkspaceTree(nodes: WorkspaceNode[]): WorkspaceTreeNode[] {
  const byParent = new Map<string | null, WorkspaceNode[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }
  const walk = (parentId: string | null): WorkspaceTreeNode[] =>
    (byParent.get(parentId) ?? []).map((node) => ({
      ...node,
      children: walk(node.id),
    }));
  return walk(null);
}

export function collectDescendantIds(nodes: WorkspaceNode[], id: string): string[] {
  const children = nodes.filter((node) => node.parentId === id);
  return children.flatMap((child) => [child.id, ...collectDescendantIds(nodes, child.id)]);
}

export function wouldCreateCycle(
  nodes: WorkspaceNode[],
  nodeId: string,
  newParentId: string | null
): boolean {
  if (newParentId === null) return false;
  if (newParentId === nodeId) return true;
  return collectDescendantIds(nodes, nodeId).includes(newParentId);
}

export function assertMoveAllowed(
  nodes: WorkspaceNode[],
  nodeId: string,
  newParentId: string | null
): void {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error("Workspace node not found");
  if (wouldCreateCycle(nodes, nodeId, newParentId)) {
    throw new Error("フォルダを自分の子へ移動することはできません");
  }
  if (newParentId) {
    const parent = nodes.find((item) => item.id === newParentId);
    if (!parent) throw new Error("移動先が見つかりません");
    if (parent.kind === "project") {
      throw new Error("Project の下に Folder / Project は置けません");
    }
  }
  if (node.kind === "project" && newParentId) {
    const parent = nodes.find((item) => item.id === newParentId);
    if (parent?.kind === "project") {
      throw new Error("Project の下に Project は置けません");
    }
  }
}

export function nextSiblingOrder(nodes: WorkspaceNode[], parentId: string | null): number {
  const siblings = nodes.filter((node) => node.parentId === parentId);
  return siblings.reduce((max, node) => Math.max(max, node.order), -1) + 1;
}

export function reorderSiblings(
  nodes: WorkspaceNode[],
  parentId: string | null,
  orderedIds: string[]
): WorkspaceNode[] {
  const siblings = nodes.filter((node) => node.parentId === parentId);
  const others = nodes.filter((node) => node.parentId !== parentId);
  const byId = new Map(siblings.map((node) => [node.id, node]));
  const next = orderedIds
    .map((id) => byId.get(id))
    .filter((node): node is WorkspaceNode => Boolean(node))
    .map((node, order) => ({ ...node, order }));
  const leftover = siblings
    .filter((node) => !orderedIds.includes(node.id))
    .map((node, index) => ({ ...node, order: next.length + index }));
  return [...others, ...next, ...leftover];
}
