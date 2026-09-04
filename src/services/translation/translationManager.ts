import { TranslationQueue } from "./translationQueue";
import { prioritiesAroundBlock } from "./readingPriority";
import type { TranslationPriorityValue } from "./types";

/**
 * Process-wide registry so Reader can change queued translation
 * priority without touching TranslationQueue internals.
 */
export class TranslationManager {
  private queues = new Map<string, TranslationQueue>();
  private focusBlockIds = new Map<string, string>();

  attach(paperId: string, queue: TranslationQueue): void {
    this.queues.set(paperId, queue);
  }

  cancel(paperId: string): void {
    this.queues.get(paperId)?.cancelPaper(paperId);
    this.detach(paperId);
  }

  detach(paperId: string): void {
    this.queues.delete(paperId);
    this.focusBlockIds.delete(paperId);
  }

  hasQueue(paperId: string): boolean {
    return this.queues.has(paperId);
  }

  focusedBlockId(paperId: string): string | undefined {
    return this.focusBlockIds.get(paperId);
  }

  /**
   * Reorder queued (not in-flight) tasks around the block the user is reading.
   * Completed tasks are ignored because they are already gone from the queue.
   */
  prioritizeAroundBlock(
    paperId: string,
    blockId: string,
    orderedBlockIds: string[]
  ): void {
    if (this.focusBlockIds.get(paperId) === blockId) return;
    const queue = this.queues.get(paperId);
    if (!queue) return;

    const map = prioritiesAroundBlock(orderedBlockIds, blockId);
    if (map.size === 0) return;

    this.focusBlockIds.set(paperId, blockId);

    const byPriority = new Map<TranslationPriorityValue, string[]>();
    for (const [id, priority] of map) {
      const list = byPriority.get(priority) ?? [];
      list.push(id);
      byPriority.set(priority, list);
    }

    // Apply LOW first so later HIGH/CRITICAL win after re-sort.
    const order: TranslationPriorityValue[] = [3, 2, 1, 0];
    for (const priority of order) {
      const ids = byPriority.get(priority);
      if (ids && ids.length > 0) {
        queue.updatePriority(paperId, ids, priority);
      }
    }
  }
}

export const translationManager = new TranslationManager();
