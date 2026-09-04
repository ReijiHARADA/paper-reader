import { TranslationPriority, type TranslationPriorityValue } from "./types";

/**
 * Priority relative to the block the reader is currently viewing.
 * delta = blockIndex - focusIndex
 */
export function priorityForOffsetFromFocus(
  delta: number
): TranslationPriorityValue {
  if (delta < 0) return TranslationPriority.LOW;
  if (delta <= 1) return TranslationPriority.CRITICAL;
  if (delta <= 3) return TranslationPriority.HIGH;
  if (delta <= 5) return TranslationPriority.MEDIUM;
  return TranslationPriority.LOW;
}

export function prioritiesAroundBlock(
  orderedBlockIds: string[],
  focusBlockId: string
): Map<string, TranslationPriorityValue> {
  const focusIndex = orderedBlockIds.indexOf(focusBlockId);
  const result = new Map<string, TranslationPriorityValue>();
  if (focusIndex < 0) return result;
  for (let i = 0; i < orderedBlockIds.length; i++) {
    result.set(
      orderedBlockIds[i],
      priorityForOffsetFromFocus(i - focusIndex)
    );
  }
  return result;
}

export const READER_PRIORITY_DEBOUNCE_MS = 400;
