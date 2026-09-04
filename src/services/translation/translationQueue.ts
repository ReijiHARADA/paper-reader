/**
 * Priority-based translation queue.
 * 
 * Manages translation tasks with priority ordering to ensure
 * critical content (title, abstract, visible content) is translated first.
 */

import type {
  TranslationEngine,
  TranslationTask,
  TranslationQueueConfig,
  TranslationPriorityValue,
} from "./types";

export { TranslationPriority } from "./types";

type TaskCallback = (task: TranslationTask) => void;

const DEFAULT_CONFIG: TranslationQueueConfig = {
  concurrency: 8,
  retryFailed: true,
  maxRetries: 2,
  retryDelayMs: 1000,
};

/**
 * Priority-based translation queue.
 */
export class TranslationQueue {
  private engine: TranslationEngine;
  private config: TranslationQueueConfig;
  private queue: TranslationTask[] = [];
  private activeCount = 0;
  private isRunning = false;
  private taskIdCounter = 0;

  // Callbacks
  private onTaskStarted?: TaskCallback;
  private onTaskCompleted?: TaskCallback;
  private onTaskFailed?: TaskCallback;

  constructor(
    engine: TranslationEngine,
    config: Partial<TranslationQueueConfig> = {}
  ) {
    this.engine = engine;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set callback for when a task starts.
   */
  setOnTaskStarted(callback: TaskCallback): void {
    this.onTaskStarted = callback;
  }

  /**
   * Set callback for when a task completes.
   */
  setOnTaskCompleted(callback: TaskCallback): void {
    this.onTaskCompleted = callback;
  }

  /**
   * Set callback for when a task fails.
   */
  setOnTaskFailed(callback: TaskCallback): void {
    this.onTaskFailed = callback;
  }

  /**
   * Add a translation task to the queue.
   */
  enqueue(
    paperId: string,
    blockId: string,
    text: string,
    priority: TranslationPriorityValue,
    sourceLanguage: string = "en",
    targetLanguage: string = "ja"
  ): string {
    const taskId = `task-${++this.taskIdCounter}`;

    const task: TranslationTask = {
      id: taskId,
      paperId,
      blockId,
      text,
      sourceLanguage,
      targetLanguage,
      priority,
      status: "queued",
      queuedAt: Date.now(),
    };

    // Insert in priority order (lower priority value = higher priority)
    const insertIndex = this.queue.findIndex((t) => t.priority > priority);
    if (insertIndex === -1) {
      this.queue.push(task);
    } else {
      this.queue.splice(insertIndex, 0, task);
    }

    // Start processing if not already running
    this.processNext();

    return taskId;
  }

  /**
   * Update the priority of existing tasks for a paper.
   * Used when user scrolls to a different section.
   */
  updatePriority(paperId: string, blockIds: string[], newPriority: TranslationPriorityValue): void {
    const blockIdSet = new Set(blockIds);

    for (const task of this.queue) {
      if (task.paperId === paperId && blockIdSet.has(task.blockId) && task.status === "queued") {
        task.priority = newPriority;
      }
    }

    // Re-sort queue by priority
    this.queue.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Cancel all tasks for a paper.
   */
  cancelPaper(paperId: string): void {
    this.queue = this.queue.filter((t) => t.paperId !== paperId);
  }

  /**
   * Get the current queue status.
   */
  getStatus(): {
    queueLength: number;
    activeCount: number;
    isRunning: boolean;
    tasksByPriority: Record<number, number>;
  } {
    const tasksByPriority: Record<number, number> = {
      0: 0,
      1: 0,
      2: 0,
      3: 0,
    };

    for (const task of this.queue) {
      if (task.status === "queued") {
        tasksByPriority[task.priority]++;
      }
    }

    return {
      queueLength: this.queue.filter((t) => t.status === "queued").length,
      activeCount: this.activeCount,
      isRunning: this.isRunning,
      tasksByPriority,
    };
  }

  /**
   * Start the queue processing.
   */
  start(): void {
    this.isRunning = true;
    this.processNext();
  }

  /**
   * Stop the queue processing.
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * Clear all queued tasks.
   */
  clear(): void {
    this.queue = this.queue.filter((t) => t.status === "translating");
  }

  private async processNext(): Promise<void> {
    if (!this.isRunning) return;
    if (this.activeCount >= this.config.concurrency) return;

    // Find next queued task
    const task = this.queue.find((t) => t.status === "queued");
    if (!task) return;

    // Mark as processing
    task.status = "translating";
    task.startedAt = Date.now();
    this.activeCount++;

    this.onTaskStarted?.(task);

    try {
      const result = await this.engine.translate(
        task.text,
        task.sourceLanguage,
        task.targetLanguage
      );

      task.status = "completed";
      task.result = result;
      task.completedAt = Date.now();

      await this.onTaskCompleted?.(task);
    } catch (error) {
      task.status = "failed";
      task.error = error instanceof Error ? error.message : "Unknown error";
      task.completedAt = Date.now();

      await this.onTaskFailed?.(task);

      // Retry if configured
      if (this.config.retryFailed) {
        const retryCount = (task as TranslationTask & { _retryCount?: number })._retryCount ?? 0;
        if (retryCount < this.config.maxRetries) {
          (task as TranslationTask & { _retryCount?: number })._retryCount = retryCount + 1;
          task.status = "queued";
          
          // Move to end of same priority level after delay
          setTimeout(() => {
            this.processNext();
          }, this.config.retryDelayMs);
        }
      }
    } finally {
      this.activeCount--;

      // Remove completed/failed tasks that won't be retried
      this.queue = this.queue.filter(
        (t) => t.status === "queued" || t.status === "translating"
      );

      // Process next task
      this.processNext();
    }
  }
}

/**
 * Create a translation queue with default settings.
 */
export function createTranslationQueue(
  engine: TranslationEngine,
  config?: Partial<TranslationQueueConfig>
): TranslationQueue {
  return new TranslationQueue(engine, config);
}
