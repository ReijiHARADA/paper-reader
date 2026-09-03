/**
 * Translation engine types and interfaces.
 * 
 * This module defines the abstraction layer for translation engines,
 * allowing easy switching between different translation backends
 * (MADLAD, OpenAI, etc.)
 */

/**
 * Result of a translation operation.
 */
export interface TranslationResult {
  /** Translated text */
  text: string;
  /** Source language code (e.g., "en") */
  sourceLanguage: string;
  /** Target language code (e.g., "ja") */
  targetLanguage: string;
  /** Model identifier */
  model: string;
  /** Model version */
  modelVersion: string;
  /** Number of input characters */
  inputChars: number;
  /** Number of output characters */
  outputChars: number;
  /** Number of input tokens (if available) */
  inputTokens?: number;
  /** Number of output tokens (if available) */
  outputTokens?: number;
  /** Translation time in milliseconds */
  translationTimeMs: number;
  /** Characters per second */
  charsPerSec: number;
  /** Tokens per second (if available) */
  tokensPerSec?: number;
}

/**
 * Status of a translation engine.
 */
export interface EngineStatus {
  /** Whether the engine is available */
  available: boolean;
  /** Whether the model is loaded */
  modelLoaded: boolean;
  /** Model name */
  modelName: string;
  /** Model version */
  modelVersion: string;
  /** Device being used (e.g., "mps", "cpu") */
  device: string;
  /** Error message if not available */
  error?: string;
}

/**
 * Translation engine interface.
 * 
 * Implementations should handle:
 * - Model loading/unloading
 * - Translation requests
 * - Status reporting
 */
export interface TranslationEngine {
  /**
   * Translate text from source language to target language.
   */
  translate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<TranslationResult>;

  /**
   * Translate multiple texts in batch.
   */
  translateBatch(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<TranslationResult[]>;

  /**
   * Get the current status of the engine.
   */
  getStatus(): Promise<EngineStatus>;

  /**
   * Load the model (if not already loaded).
   */
  loadModel(): Promise<void>;

  /**
   * Unload the model from memory.
   */
  unloadModel(): Promise<void>;

  /**
   * Engine name for identification.
   */
  readonly name: string;
}

/**
 * Translation task priority levels.
 */
export const TranslationPriority = {
  /** Title and abstract - translate immediately */
  CRITICAL: 0,
  /** Currently visible content */
  HIGH: 1,
  /** Content about to be viewed (prefetch) */
  MEDIUM: 2,
  /** Background translation of remaining content */
  LOW: 3,
} as const;

export type TranslationPriorityValue = (typeof TranslationPriority)[keyof typeof TranslationPriority];

/**
 * Translation task in the queue.
 */
export interface TranslationTask {
  /** Unique task ID */
  id: string;
  /** Paper ID this task belongs to */
  paperId: string;
  /** Block ID being translated */
  blockId: string;
  /** Text to translate */
  text: string;
  /** Source language */
  sourceLanguage: string;
  /** Target language */
  targetLanguage: string;
  /** Priority level */
  priority: TranslationPriorityValue;
  /** Task status */
  status: "queued" | "translating" | "completed" | "failed";
  /** Result if completed */
  result?: TranslationResult;
  /** Error if failed */
  error?: string;
  /** Timestamp when queued */
  queuedAt: number;
  /** Timestamp when started */
  startedAt?: number;
  /** Timestamp when completed */
  completedAt?: number;
}

/**
 * Translation queue configuration.
 */
export interface TranslationQueueConfig {
  /** Maximum concurrent translations */
  concurrency: number;
  /** Whether to retry failed translations */
  retryFailed: boolean;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Delay between retries in ms */
  retryDelayMs: number;
}

/**
 * Translation cache entry.
 */
export interface TranslationCacheEntry {
  /** Original text hash */
  textHash: string;
  /** Source language */
  sourceLanguage: string;
  /** Target language */
  targetLanguage: string;
  /** Model used for translation */
  model: string;
  /** Model version */
  modelVersion: string;
  /** Translated text */
  translatedText: string;
  /** Timestamp when cached */
  cachedAt: number;
}
