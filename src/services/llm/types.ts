/**
 * LLM Provider types and interfaces.
 * 
 * This module defines the abstraction layer for LLM providers,
 * used for paper analysis, summarization, and glossary generation.
 */

/**
 * LLM completion result.
 */
export interface LLMCompletionResult {
  /** Generated text */
  text: string;
  /** Model used */
  model: string;
  /** Completion time in milliseconds */
  completionTimeMs: number;
  /** Input tokens (if available) */
  inputTokens?: number;
  /** Output tokens (if available) */
  outputTokens?: number;
}

/**
 * LLM provider status.
 */
export interface LLMProviderStatus {
  /** Whether the provider is available */
  available: boolean;
  /** Available models */
  models: string[];
  /** Current model (if any) */
  currentModel?: string;
  /** Error message if not available */
  error?: string;
}

/**
 * LLM provider interface.
 * 
 * Implementations should handle:
 * - Chat completions
 * - Status reporting
 */
export interface LLMProvider {
  /**
   * Generate a completion for the given prompt.
   */
  complete(
    prompt: string,
    systemPrompt?: string,
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResult>;

  /**
   * Get the current status of the provider.
   */
  getStatus(): Promise<LLMProviderStatus>;

  /**
   * List available models.
   */
  listModels(): Promise<string[]>;

  /**
   * Set the model to use.
   */
  setModel(model: string): void;

  /**
   * Provider name for identification.
   */
  readonly name: string;

  /**
   * Current model name.
   */
  readonly model: string;
}

/**
 * Options for LLM completion.
 */
export interface LLMCompletionOptions {
  /** Temperature for sampling (0-1) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Stop sequences */
  stopSequences?: string[];
}

/**
 * Glossary entry.
 */
export interface GlossaryEntry {
  /** Original term (English) */
  term: string;
  /** Japanese translation */
  translation: string;
  /** Optional definition/explanation */
  definition?: string;
}

/**
 * Paper analysis result from LLM.
 */
export interface PaperAnalysis {
  /** Paper summary */
  summary: string;
  /** Research question(s) */
  researchQuestions: string[];
  /** Background/context */
  background: string;
  /** Methodology */
  method: string;
  /** Key findings */
  findings: string[];
  /** Limitations */
  limitations: string[];
  /** Glossary of key terms */
  glossary: GlossaryEntry[];
}
