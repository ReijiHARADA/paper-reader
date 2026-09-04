import type { Annotation } from "../types/annotation";
import { ANNOTATION_CONTEXT_CHARS } from "../types/annotation";

export function captureContext(
  text: string,
  startOffset: number,
  endOffset: number,
  contextChars = ANNOTATION_CONTEXT_CHARS
): { prefixContext: string; suffixContext: string } {
  const start = Math.max(0, startOffset);
  const end = Math.min(text.length, endOffset);
  return {
    prefixContext: text.slice(Math.max(0, start - contextChars), start),
    suffixContext: text.slice(end, Math.min(text.length, end + contextChars)),
  };
}

function commonSuffixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) {
    i++;
  }
  return i;
}

function commonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i++;
  }
  return i;
}

function findOccurrences(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const hits: number[] = [];
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    hits.push(idx);
    from = idx + 1;
  }
  return hits;
}

function nowIso(): string {
  return new Date().toISOString();
}

function orphan(annotation: Annotation): Annotation {
  if (annotation.status === "orphaned") return annotation;
  return { ...annotation, status: "orphaned", updatedAt: nowIso() };
}

function place(
  annotation: Annotation,
  start: number,
  hash: string
): Annotation {
  const end = start + annotation.selectedText.length;
  return {
    ...annotation,
    startOffset: start,
    endOffset: end,
    translationTextHash: hash,
    status: "active",
    updatedAt: nowIso(),
  };
}

/**
 * Re-attach an annotation to the current translated string.
 * Never deletes the annotation.
 */
export function reanchorAnnotation(
  annotation: Annotation,
  translated: string | null | undefined,
  currentHash: string
): Annotation {
  if (!translated) return orphan(annotation);

  if (annotation.translationTextHash === currentHash) {
    return annotation.status === "active"
      ? annotation
      : { ...annotation, status: "active", updatedAt: nowIso() };
  }

  const selected = annotation.selectedText;
  if (!selected) return orphan(annotation);

  const hits = findOccurrences(translated, selected);
  if (hits.length === 1) {
    return place(annotation, hits[0], currentHash);
  }

  if (hits.length > 1) {
    let best = hits[0];
    let bestScore = -1;
    for (const idx of hits) {
      const prefix = translated.slice(
        Math.max(0, idx - annotation.prefixContext.length),
        idx
      );
      const suffix = translated.slice(
        idx + selected.length,
        idx + selected.length + annotation.suffixContext.length
      );
      const score =
        commonSuffixLength(prefix, annotation.prefixContext) +
        commonPrefixLength(suffix, annotation.suffixContext);
      if (score > bestScore) {
        bestScore = score;
        best = idx;
      }
    }
    return place(annotation, best, currentHash);
  }

  return orphan(annotation);
}

export function offsetsMatchSelectedText(
  translated: string,
  startOffset: number,
  endOffset: number,
  selectedText: string
): boolean {
  return translated.slice(startOffset, endOffset) === selectedText;
}
