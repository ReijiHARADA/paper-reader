export type WorkspaceNodeKind = "folder" | "project";

export type WorkspaceNode = {
  id: string;
  parentId: string | null;
  kind: WorkspaceNodeKind;
  name: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceTreeNode = WorkspaceNode & {
  children: WorkspaceTreeNode[];
};
