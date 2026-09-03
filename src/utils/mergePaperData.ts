import type { PaperBlock, Section } from "../types/paper";

/**
 * Merge IndexedDB snapshots with in-memory translations.
 * Never replace a completed Japanese block with a stale pending row.
 */
export function mergePreferTranslated(
  prev: PaperBlock[],
  incoming: PaperBlock[]
): PaperBlock[] {
  const prevById = new Map(prev.map((b) => [b.id, b]));
  const seen = new Set<string>();

  const merged = incoming.map((block) => {
    seen.add(block.id);
    const old = prevById.get(block.id);
    if (!old) return block;
    if (old.translated && !block.translated) {
      return {
        ...block,
        translated: old.translated,
        translationStatus: old.translationStatus,
      };
    }
    if (
      old.translationStatus === "completed" &&
      block.translationStatus !== "completed"
    ) {
      return old;
    }
    return {
      ...block,
      translated: block.translated || old.translated,
      translationStatus:
        block.translated || block.translationStatus === "completed"
          ? block.translationStatus
          : old.translationStatus,
    };
  });

  for (const old of prev) {
    if (!seen.has(old.id)) {
      merged.push(old);
    }
  }

  return merged.sort((a, b) => a.order - b.order);
}

export function mergePreferTranslatedSections(
  prev: Section[],
  incoming: Section[]
): Section[] {
  const prevById = new Map(prev.map((s) => [s.id, s]));
  const seen = new Set<string>();

  const merged = incoming.map((section) => {
    seen.add(section.id);
    const old = prevById.get(section.id);
    if (old?.translatedTitle && !section.translatedTitle) {
      return { ...section, translatedTitle: old.translatedTitle };
    }
    return {
      ...section,
      translatedTitle: section.translatedTitle || old?.translatedTitle || null,
    };
  });

  for (const old of prev) {
    if (!seen.has(old.id)) {
      merged.push(old);
    }
  }

  return merged.sort((a, b) => a.order - b.order);
}

export function upsertBlock(
  prev: PaperBlock[],
  block: PaperBlock
): PaperBlock[] {
  const index = prev.findIndex((b) => b.id === block.id);
  if (index === -1) {
    return [...prev, block].sort((a, b) => a.order - b.order);
  }
  const next = prev.slice();
  next[index] = { ...prev[index], ...block };
  return next;
}

export function upsertSection(
  prev: Section[],
  section: Section
): Section[] {
  const index = prev.findIndex((s) => s.id === section.id);
  if (index === -1) {
    return [...prev, section].sort((a, b) => a.order - b.order);
  }
  const next = prev.slice();
  next[index] = { ...prev[index], ...section };
  return next;
}
