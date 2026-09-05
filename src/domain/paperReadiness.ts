import type { PaperBlock, ProcessingStatus } from "../types/paper";
import { isBusyProcessingStatus } from "../services/paperStatus";

export type PaperReadiness = "preparing" | "readable" | "translating" | "needs_attention";

export type PaperReadinessView = {
  readiness: PaperReadiness;
  label: string;
  canOpen: boolean;
};

export function hasReadableBody(blocks: PaperBlock[] | undefined): boolean {
  if (!blocks?.length) return false;
  return blocks.some((block) => {
    if (block.type === "reference") return false;
    return Boolean(block.original || block.translated);
  });
}

export function translationPercent(
  blocks: PaperBlock[] | undefined,
  shouldTranslate: (block: PaperBlock) => boolean
): number | null {
  if (!blocks?.length) return null;
  const targets = blocks.filter((block) => shouldTranslate(block));
  if (targets.length === 0) return 100;
  const done = targets.filter(
    (block) => block.translationStatus === "completed" || block.translationStatus === "skipped"
  ).length;
  return Math.round((done / targets.length) * 100);
}

export function derivePaperReadiness(input: {
  processingStatus: ProcessingStatus;
  blocks?: PaperBlock[];
}): PaperReadinessView {
  const { processingStatus, blocks } = input;
  const readable = hasReadableBody(blocks);

  if (processingStatus === "failed") {
    return { readiness: "needs_attention", label: "要確認", canOpen: readable };
  }
  if (processingStatus === "partial") {
    return { readiness: "needs_attention", label: "要確認", canOpen: readable };
  }
  if (processingStatus === "translating" || processingStatus === "glossary") {
    return {
      readiness: "translating",
      label: "日本語化中",
      canOpen: true,
    };
  }
  if (isBusyProcessingStatus(processingStatus) && !readable) {
    return { readiness: "preparing", label: "準備中", canOpen: false };
  }
  if (isBusyProcessingStatus(processingStatus) && readable) {
    return { readiness: "translating", label: "日本語化中", canOpen: true };
  }
  return { readiness: "readable", label: "読めます", canOpen: true };
}

export function formatTranslationProgressLabel(
  readiness: PaperReadiness,
  percent: number | null
): string {
  if (readiness === "translating" && percent != null) {
    return `日本語化中 ${percent}%`;
  }
  if (readiness === "translating") return "日本語化中";
  if (readiness === "preparing") return "準備中";
  if (readiness === "needs_attention") return "要確認";
  return "読めます";
}
