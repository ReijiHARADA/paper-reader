import type { Paper, PaperBlock } from "../types/paper";

export function readingProgressPercent(
  lastReadBlockId: string | null | undefined,
  blocks: Array<Pick<PaperBlock, "id" | "order">> | undefined
): number | null {
  if (!lastReadBlockId || !blocks?.length) return null;
  const ordered = [...blocks].sort((a, b) => a.order - b.order);
  const index = ordered.findIndex((block) => block.id === lastReadBlockId);
  if (index < 0) return null;
  return Math.round(((index + 1) / ordered.length) * 100);
}

export function formatReadingProgress(percent: number | null): string | null {
  if (percent == null) return null;
  return `${percent}%まで読了`;
}

export function continueReadingPapers(papers: Paper[], limit = 3): Paper[] {
  return [...papers]
    .filter((paper) => paper.lastOpenedAt || paper.lastReadBlockId)
    .sort((a, b) => {
      const left = a.lastOpenedAt ?? a.updatedAt;
      const right = b.lastOpenedAt ?? b.updatedAt;
      return right.localeCompare(left);
    })
    .slice(0, limit);
}

export function formatRelativeOpenedAt(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfThatDay = new Date(date);
  startOfThatDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((startOfToday.getTime() - startOfThatDay.getTime()) / 86_400_000);
  if (dayDiff === 0) return "今日";
  if (dayDiff === 1) return "昨日";
  if (dayDiff < 7) return `${dayDiff}日前`;
  return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}
