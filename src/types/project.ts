export type ProjectPaperStatus = "unread" | "reading" | "read";

export type ProjectPaperDecision = "adopt" | "hold" | "exclude";

export type Project = {
  id: string;
  name: string;
  description?: string;
  researchQuestion?: string;
  keywords?: string[];
  createdAt: string;
  updatedAt: string;
};

/** Theme-specific link. The Paper record is not copied. */
export type ProjectPaper = {
  projectId: string;
  paperId: string;
  /** Placement within this project; omitted legacy values mean project root. */
  folderId?: string | null;
  /** Persisted as 0 when omitted by older callers. */
  order?: number;
  note?: string;
  relevance?: number;
  status?: ProjectPaperStatus;
  decision?: ProjectPaperDecision;
  tags?: string[];
  quotes?: string[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectCorpus = {
  project: Project;
  papers: import("./paper").Paper[];
  memberships: ProjectPaper[];
};

export type LibraryView = "all" | "inbox" | "favorites" | "recent" | "project";

export type { WorkspaceNode, WorkspaceTreeNode } from "../data/types/workspace";
