import type { PaperBlock } from "../types/paper";

const CITATION_RE = /\[(\d+(?:\s*[,–—-]\s*\d+)*)\]/g;

export function parseCitationGroups(
  text: string
): { start: number; end: number; keys: string[] }[] {
  const groups: { start: number; end: number; keys: string[] }[] = [];
  const re = new RegExp(CITATION_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const keys = expandCitationKeys(match[1]);
    if (keys.length === 0) continue;
    groups.push({ start: match.index, end: match.index + match[0].length, keys });
  }
  return groups;
}

export function expandCitationKeys(inner: string): string[] {
  const keys: string[] = [];
  for (const part of inner.split(/\s*,\s*/)) {
    const range = part.match(/^(\d+)\s*[–—-]\s*(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from > 0 && to >= from && to - from <= 20) {
        for (let n = from; n <= to; n++) keys.push(String(n));
      }
      continue;
    }
    if (/^\d+$/.test(part)) keys.push(part);
  }
  return [...new Set(keys)];
}

export function referenceKeyFromText(text: string): string | null {
  const t = text.trim();
  const bracket = t.match(/^\[(\d+)\]/);
  if (bracket) return bracket[1];
  const numbered = t.match(/^(\d+)\.\s+[A-Z]/);
  if (numbered) return numbered[1];
  return null;
}

export function indexReferenceBlocks(
  blocks: PaperBlock[]
): Map<string, string> {
  const index = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const block of blocks) {
    if (block.type !== "reference" && String(block.metadata?.role ?? "") !== "reference") {
      if (block.type !== "paragraph") continue;
    }
    const source = block.original || "";
    const key = referenceKeyFromText(source);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const target =
      typeof block.metadata.referenceId === "string" && block.metadata.referenceId
        ? block.metadata.referenceId
        : block.id;
    if (!index.has(key)) index.set(key, target);
  }
  for (const [key, count] of counts) {
    if (count !== 1) index.delete(key);
  }
  return index;
}

export function uniqueCitationTarget(
  keys: string[],
  index: Map<string, string>
): string | null {
  if (keys.length !== 1) return null;
  return index.get(keys[0]) ?? null;
}
