import { v4 as uuidv4 } from "uuid";
import type { Paper } from "../types/paper";
import type {
  Project,
  ProjectCorpus,
  ProjectPaper,
  ProjectPaperDecision,
  ProjectPaperStatus,
} from "../types/project";
import {
  deleteProject as deleteProjectRecord,
  deleteProjectPaper,
  getAllPapers,
  getAllProjectPapers,
  getAllProjects,
  getPaper,
  getProject,
  getProjectPaper,
  getProjectPapersByPaper,
  getProjectPapersByProject,
  saveProject,
  saveProjectPaper,
} from "./database";

export type CreateProjectInput = {
  name: string;
  description?: string;
  researchQuestion?: string;
  keywords?: string[];
};

export type AddPaperToProjectInput = {
  projectId: string;
  paperId: string;
  note?: string;
  relevance?: number;
  status?: ProjectPaperStatus;
  decision?: ProjectPaperDecision;
  tags?: string[];
  quotes?: string[];
};

function nowIso(): string {
  return new Date().toISOString();
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Project name is required");
  }
  const stamp = nowIso();
  const project: Project = {
    id: uuidv4(),
    name,
    description: input.description?.trim() || undefined,
    researchQuestion: input.researchQuestion?.trim() || undefined,
    keywords: input.keywords?.filter(Boolean),
    createdAt: stamp,
    updatedAt: stamp,
  };
  await saveProject(project);
  return project;
}

export async function updateProject(
  projectId: string,
  updates: Partial<Omit<Project, "id" | "createdAt">>
): Promise<Project> {
  const existing = await getProject(projectId);
  if (!existing) {
    throw new Error(`Project not found: ${projectId}`);
  }
  const project: Project = {
    ...existing,
    ...updates,
    name: (updates.name ?? existing.name).trim(),
    updatedAt: nowIso(),
  };
  await saveProject(project);
  return project;
}

export async function removeProject(projectId: string): Promise<void> {
  await deleteProjectRecord(projectId);
}

export async function listProjects(): Promise<Project[]> {
  return getAllProjects();
}

export class DuplicateProjectPaperError extends Error {
  readonly projectId: string;
  readonly paperId: string;

  constructor(projectId: string, paperId: string) {
    super("このプロジェクトにはすでに入っています");
    this.name = "DuplicateProjectPaperError";
    this.projectId = projectId;
    this.paperId = paperId;
  }
}

export async function addPaperToProject(
  input: AddPaperToProjectInput
): Promise<ProjectPaper> {
  const existing = await getProjectPaper(input.projectId, input.paperId);
  if (existing) {
    throw new DuplicateProjectPaperError(input.projectId, input.paperId);
  }
  const stamp = nowIso();
  const link: ProjectPaper = {
    projectId: input.projectId,
    paperId: input.paperId,
    note: input.note,
    relevance: input.relevance,
    status: input.status ?? "unread",
    decision: input.decision,
    tags: input.tags,
    quotes: input.quotes,
    createdAt: stamp,
    updatedAt: stamp,
  };
  await saveProjectPaper(link);
  return link;
}

export async function removePaperFromProject(
  projectId: string,
  paperId: string
): Promise<void> {
  await deleteProjectPaper(projectId, paperId);
}

export async function removePaperFromAllProjects(paperId: string): Promise<number> {
  const links = await getProjectPapersByPaper(paperId);
  for (const link of links) {
    await deleteProjectPaper(link.projectId, paperId);
  }
  return links.length;
}

export async function listProjectPapers(projectId: string): Promise<ProjectPaper[]> {
  return getProjectPapersByProject(projectId);
}

export async function listPaperProjects(paperId: string): Promise<Project[]> {
  const links = await getProjectPapersByPaper(paperId);
  const projects = await Promise.all(links.map((link) => getProject(link.projectId)));
  return projects.filter((project): project is Project => Boolean(project));
}

export async function listPapersForProject(projectId: string): Promise<Paper[]> {
  const links = await getProjectPapersByProject(projectId);
  const papers = await Promise.all(links.map((link) => getPaper(link.paperId)));
  return papers.filter((paper): paper is Paper => Boolean(paper));
}

export async function listInboxPapers(): Promise<Paper[]> {
  const [papers, links] = await Promise.all([getAllPapers(), getAllProjectPapers()]);
  const assigned = new Set(links.map((link) => link.paperId));
  return papers.filter((paper) => !assigned.has(paper.id));
}

/** Fetch one project's papers for later search / QA / summary features. */
export async function getProjectCorpus(projectId: string): Promise<ProjectCorpus> {
  const project = await getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  const memberships = await getProjectPapersByProject(projectId);
  const papers = await Promise.all(memberships.map((link) => getPaper(link.paperId)));
  return {
    project,
    memberships,
    papers: papers.filter((paper): paper is Paper => Boolean(paper)),
  };
}

export function isPaperInInbox(paperId: string, memberships: ProjectPaper[]): boolean {
  return !memberships.some((link) => link.paperId === paperId);
}
