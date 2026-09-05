export type ProjectPaperStatus = "unread" | "reading" | "read";

export type ProjectPaperDecision = "adopt" | "hold" | "exclude";

/** A Paper record remains global; this is its workspace placement. */
export type WorkspacePaper = {
  nodeId: string;
  paperId: string;
  order: number;
  note?: string;
  relevance?: number;
  status?: ProjectPaperStatus;
  decision?: ProjectPaperDecision;
  tags?: string[];
  quotes?: string[];
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceCorpus = {
  node: import("../data/types/workspace").WorkspaceNode;
  papers: import("./paper").Paper[];
  memberships: WorkspacePaper[];
};

export type LibraryView = "all" | "inbox" | "favorites" | "recent" | "project";

export type { WorkspaceNode, WorkspaceTreeNode } from "../data/types/workspace";
