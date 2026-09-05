export type WorkspaceNode = {
  id: string;
  parentId: string | null;
  name: string;
  order: number;
  description?: string;
  researchQuestion?: string;
  keywords?: string[];
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceTreeNode = WorkspaceNode & {
  children: WorkspaceTreeNode[];
};
