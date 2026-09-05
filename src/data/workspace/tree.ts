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
  const seen = new Set<string>([id]);
  const stack = [id];
  const result: string[] = [];
  while (stack.length) {
    const parent = stack.pop();
    for (const child of nodes.filter((node) => node.parentId === parent)) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      result.push(child.id);
      stack.push(child.id);
    }
  }
  return result;
}

export const PROJECT_NESTING_ERROR = "プロジェクトの中に別のプロジェクトを移動することはできません。";

export function owningProjectId(nodes: WorkspaceNode[], id: string | null): string | null {
  const seen = new Set<string>();
  while (id !== null) {
    if (seen.has(id)) throw new Error("ツリーに循環があります");
    seen.add(id);
    const node = nodes.find((item) => item.id === id);
    if (!node) throw new Error("移動先が見つかりません");
    if (node.kind === "project") return node.id;
    id = node.parentId;
  }
  return null;
}

export function wouldCreateCycle(nodes: WorkspaceNode[], nodeId: string, newParentId: string | null): boolean {
  return newParentId !== null && (newParentId === nodeId || collectDescendantIds(nodes, nodeId).includes(newParentId));
}

export function assertMoveAllowed(nodes: WorkspaceNode[], nodeId: string, newParentId: string | null): void {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error("Workspace node not found");
  if (wouldCreateCycle(nodes, nodeId, newParentId)) {
    throw new Error("フォルダを自分の子へ移動することはできません");
  }
  const projectId = owningProjectId(nodes, newParentId);
  const subtree = new Set([nodeId, ...collectDescendantIds(nodes, nodeId)]);
  if (projectId && nodes.some((item) => subtree.has(item.id) && item.kind === "project")) {
    throw new Error(PROJECT_NESTING_ERROR);
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
