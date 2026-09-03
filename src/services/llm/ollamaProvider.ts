/**
 * Ollama LLM Provider.
 * 
 * Connects to local Ollama server for LLM operations
 * (summarization, glossary generation, Q&A, etc.)
 */

import type {
  LLMProvider,
  LLMCompletionResult,
  LLMProviderStatus,
  LLMCompletionOptions,
} from "./types";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "gemma2:9b";

/**
 * Ollama LLM provider implementation.
 */
export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  private baseUrl: string;
  private _model: string;

  constructor(baseUrl: string = DEFAULT_BASE_URL, model: string = DEFAULT_MODEL) {
    this.baseUrl = baseUrl;
    this._model = model;
  }

  get model(): string {
    return this._model;
  }

  setModel(model: string): void {
    this._model = model;
  }

  async complete(
    prompt: string,
    systemPrompt?: string,
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResult> {
    const startTime = Date.now();

    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this._model,
        messages,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.3,
          num_predict: options?.maxTokens ?? 2000,
          stop: options?.stopSequences,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    const completionTimeMs = Date.now() - startTime;

    return {
      text: data.message.content.trim(),
      model: this._model,
      completionTimeMs,
      inputTokens: data.prompt_eval_count,
      outputTokens: data.eval_count,
    };
  }

  async getStatus(): Promise<LLMProviderStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);

      if (!response.ok) {
        return {
          available: false,
          models: [],
          error: `Server error: ${response.status}`,
        };
      }

      const data = await response.json();
      const models = (data.models || []).map((m: { name: string }) => m.name);

      return {
        available: true,
        models,
        currentModel: this._model,
      };
    } catch (e) {
      return {
        available: false,
        models: [],
        error: "Ollamaに接続できません。`ollama serve` で起動してください。",
      };
    }
  }

  async listModels(): Promise<string[]> {
    const status = await this.getStatus();
    return status.models;
  }
}

/**
 * Check if Ollama is available.
 */
export async function checkOllamaAvailability(
  baseUrl: string = DEFAULT_BASE_URL
): Promise<{ available: boolean; models: string[]; error?: string }> {
  const provider = new OllamaProvider(baseUrl);
  const status = await provider.getStatus();
  return {
    available: status.available,
    models: status.models,
    error: status.error,
  };
}
