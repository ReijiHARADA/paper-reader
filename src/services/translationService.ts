import type { PaperBlock, Section } from "../types/paper";

export type TranslationProvider = "openai" | "ollama" | "mock";

export type TranslationConfig = {
  provider: TranslationProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export type TranslationContext = {
  paperTitle?: string;
  sectionTitle?: string;
  previousParagraph?: string;
  nextParagraph?: string;
  glossary?: Map<string, string>;
};

const SYSTEM_PROMPT = `You are a professional academic translator specializing in translating English academic papers into Japanese. Follow these rules:

1. Translate the given paragraph from English to Japanese
2. Maintain academic tone and precision
3. Keep technical terms consistent with the provided glossary if given
4. Preserve citation markers like [1], [2], (Author, Year) exactly as they appear
5. Keep mathematical notation and variable names unchanged
6. Translate naturally while preserving the original meaning
7. Output ONLY the Japanese translation, nothing else`;

function buildUserPrompt(
  text: string,
  context: TranslationContext
): string {
  let prompt = "";

  if (context.sectionTitle) {
    prompt += `Section: ${context.sectionTitle}\n\n`;
  }

  if (context.previousParagraph) {
    prompt += `Previous paragraph (for context):\n${context.previousParagraph}\n\n`;
  }

  prompt += `Translate the following paragraph to Japanese:\n\n${text}`;

  if (context.nextParagraph) {
    prompt += `\n\nNext paragraph (for context):\n${context.nextParagraph}`;
  }

  if (context.glossary && context.glossary.size > 0) {
    prompt += "\n\nGlossary (use these translations):\n";
    for (const [en, ja] of context.glossary) {
      prompt += `- ${en}: ${ja}\n`;
    }
  }

  return prompt;
}

async function translateWithOpenAI(
  text: string,
  context: TranslationContext,
  config: TranslationConfig
): Promise<string> {
  if (!config.apiKey) {
    throw new Error("OpenAI API key is required");
  }

  const response = await fetch(config.baseUrl || "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(text, context) },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function translateWithOllama(
  text: string,
  context: TranslationContext,
  config: TranslationConfig
): Promise<string> {
  const baseUrl = config.baseUrl || "http://localhost:11434";
  const model = config.model || "gemma2:9b";

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(text, context) },
      ],
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: 2000,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    if (response.status === 0 || error.includes("fetch")) {
      throw new Error(
        "Ollamaに接続できません。Ollamaが起動しているか確認してください。\n" +
        "起動方法: ターミナルで `ollama serve` を実行"
      );
    }
    throw new Error(`Ollama API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.message.content.trim();
}

// Check if Ollama is available and has the required model
export async function checkOllamaStatus(
  baseUrl: string = "http://localhost:11434",
  model: string = "gemma2:9b"
): Promise<{ available: boolean; hasModel: boolean; models: string[]; error?: string }> {
  try {
    // Check if Ollama is running
    const tagsResponse = await fetch(`${baseUrl}/api/tags`, {
      method: "GET",
    });

    if (!tagsResponse.ok) {
      return { available: false, hasModel: false, models: [], error: "Ollamaに接続できません" };
    }

    const tagsData = await tagsResponse.json();
    const models = (tagsData.models || []).map((m: { name: string }) => m.name);
    const hasModel = models.some((m: string) => m.startsWith(model.split(":")[0]));

    return { available: true, hasModel, models };
  } catch (e) {
    return {
      available: false,
      hasModel: false,
      models: [],
      error: "Ollamaに接続できません。`ollama serve` で起動してください。",
    };
  }
}

// Get available Ollama models
export async function getOllamaModels(
  baseUrl: string = "http://localhost:11434"
): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok) return [];
    const data = await response.json();
    return (data.models || []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  }
}

function translateWithMock(text: string): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`【翻訳】${text.substring(0, 100)}...（モック翻訳）`);
    }, 500);
  });
}

export async function translateText(
  text: string,
  context: TranslationContext,
  config: TranslationConfig
): Promise<string> {
  switch (config.provider) {
    case "openai":
      return translateWithOpenAI(text, context, config);
    case "ollama":
      return translateWithOllama(text, context, config);
    case "mock":
      return translateWithMock(text);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

export async function translateBlocks(
  blocks: PaperBlock[],
  sections: Section[],
  config: TranslationConfig,
  onProgress?: (completed: number, total: number, currentBlock: PaperBlock) => void,
  onBlockTranslated?: (block: PaperBlock, translation: string) => void
): Promise<Map<string, string>> {
  const translations = new Map<string, string>();
  const translatableBlocks = blocks.filter(
    (b) =>
      b.translationStatus === "pending" &&
      b.original &&
      (b.type === "paragraph" || b.type === "heading")
  );

  const sectionMap = new Map(sections.map((s) => [s.id, s]));
  let completed = 0;

  for (let i = 0; i < translatableBlocks.length; i++) {
    const block = translatableBlocks[i];
    onProgress?.(completed, translatableBlocks.length, block);

    try {
      const section = block.sectionId ? sectionMap.get(block.sectionId) : undefined;
      const prevBlock = i > 0 ? translatableBlocks[i - 1] : undefined;
      const nextBlock = i < translatableBlocks.length - 1 ? translatableBlocks[i + 1] : undefined;

      const context: TranslationContext = {
        sectionTitle: section?.originalTitle,
        previousParagraph: prevBlock?.original || undefined,
        nextParagraph: nextBlock?.original || undefined,
      };

      const translation = await translateText(block.original!, context, config);
      translations.set(block.id, translation);
      onBlockTranslated?.(block, translation);
      completed++;
    } catch (error) {
      console.error(`Failed to translate block ${block.id}:`, error);
      completed++;
    }
  }

  onProgress?.(completed, translatableBlocks.length, translatableBlocks[translatableBlocks.length - 1]);
  return translations;
}

export async function translateSectionTitles(
  sections: Section[],
  config: TranslationConfig,
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, string>> {
  const translations = new Map<string, string>();

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    onProgress?.(i, sections.length);

    try {
      const translation = await translateText(
        section.originalTitle,
        {},
        config
      );
      translations.set(section.id, translation);
    } catch (error) {
      console.error(`Failed to translate section ${section.id}:`, error);
    }
  }

  onProgress?.(sections.length, sections.length);
  return translations;
}

export async function translateTitle(
  title: string,
  config: TranslationConfig
): Promise<string> {
  return translateText(title, {}, config);
}
