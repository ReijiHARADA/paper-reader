import { create } from "zustand";
import type { ImportStage } from "../services/importServiceV2";

export type ImportJob = {
  id: string;
  fileName: string;
  fileKey: string;
  workspaceNodeId?: string;
  paperId?: string;
  stage: ImportStage;
  stageProgress: number;
  stageTotal: number;
  message: string;
  error?: string;
};

type ImportJobState = {
  jobs: ImportJob[];
  upsertJob: (job: ImportJob) => void;
  patchJob: (id: string, patch: Partial<ImportJob>) => void;
  removeJob: (id: string) => void;
};

export const useImportJobStore = create<ImportJobState>((set) => ({
  jobs: [],
  upsertJob: (job) =>
    set((state) => {
      const exists = state.jobs.some((item) => item.id === job.id);
      return {
        jobs: exists
          ? state.jobs.map((item) => (item.id === job.id ? job : item))
          : [job, ...state.jobs],
      };
    }),
  patchJob: (id, patch) =>
    set((state) => ({
      jobs: state.jobs.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })),
  removeJob: (id) => set((state) => ({ jobs: state.jobs.filter((item) => item.id !== id) })),
}));

export function visibleImportJobs(
  jobs: ImportJob[],
  options?: { workspaceNodeId?: string; inboxOnly?: boolean }
): ImportJob[] {
  return jobs.filter((job) => {
    // The normal PaperCard owns all states after a paper has materialized,
    // including failures. Keeping the transient card would show one import as
    // two separate papers.
    if (job.paperId) return false;
    if (options?.workspaceNodeId) return job.workspaceNodeId === options.workspaceNodeId;
    if (options?.inboxOnly) return !job.workspaceNodeId;
    return true;
  });
}
