import { normalizeBlockText } from "./ids";
import type { PaperBlock } from "../../types/paper";

export type ReconcileMatch = {
  previousId: string;
  nextId: string;
  score: number;
};

function scorePair(prev: PaperBlock, next: PaperBlock): number {
  let score = 0;
  if (prev.type === next.type) score += 2;
  if (prev.pageStart === next.pageStart) score += 2;
  const a = normalizeBlockText(prev.original ?? "");
  const b = normalizeBlockText(next.original ?? "");
  if (a && a === b) score += 8;
  else if (a && b && (a.includes(b) || b.includes(a))) score += 4;
  if (prev.sectionId && prev.sectionId === next.sectionId) score += 1;
  const box = prev.boundingBoxes[0];
  const other = next.boundingBoxes[0];
  if (box && other && box.page === other.page) {
    const dx = Math.abs(box.x - other.x);
    const dy = Math.abs(box.y - other.y);
    if (dx < 12 && dy < 12) score += 3;
  }
  return score;
}

/**
 * Map previous block IDs onto a newly extracted set.
 * Prefer exact text+page matches, then neighborhood / bbox.
 */
export function reconcileBlockIds(
  previous: PaperBlock[],
  next: PaperBlock[]
): { blocks: PaperBlock[]; matches: ReconcileMatch[] } {
  const usedPrev = new Set<string>();
  const usedNext = new Set<string>();
  const matches: ReconcileMatch[] = [];
  const idMap = new Map<string, string>();

  const candidates: Array<{ prev: PaperBlock; next: PaperBlock; score: number }> = [];
  for (const prev of previous) {
    for (const cur of next) {
      const score = scorePair(prev, cur);
      if (score >= 6) candidates.push({ prev, next: cur, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const item of candidates) {
    if (usedPrev.has(item.prev.id) || usedNext.has(item.next.id)) continue;
    usedPrev.add(item.prev.id);
    usedNext.add(item.next.id);
    idMap.set(item.next.id, item.prev.id);
    matches.push({ previousId: item.prev.id, nextId: item.next.id, score: item.score });
  }

  const blocks = next.map((block) => {
    const reused = idMap.get(block.id);
    return reused ? { ...block, id: reused } : block;
  });

  return { blocks, matches };
}

export function remapIds(matches: ReconcileMatch[]): Map<string, string> {
  return new Map(matches.map((match) => [match.nextId, match.previousId]));
}

export function remapAnnotationBlockIds<T extends { blockId: string }>(
  annotations: T[],
  matches: ReconcileMatch[]
): T[] {
  const nextToPrev = remapIds(matches);
  return annotations.map((annotation) => {
    const mapped = nextToPrev.get(annotation.blockId);
    return mapped ? { ...annotation, blockId: mapped } : annotation;
  });
}

export function remapReadingBlockId(
  blockId: string | null | undefined,
  matches: ReconcileMatch[]
): string | null {
  if (!blockId) return null;
  return remapIds(matches).get(blockId) ?? blockId;
}
