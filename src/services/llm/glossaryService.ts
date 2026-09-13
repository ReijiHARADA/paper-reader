/**
 * Glossary Generation Service.
 * 
 * Uses LLM to extract key terms from a paper and generate
 * consistent Japanese translations for them.
 */

import type { LLMProvider, GlossaryEntry } from "./types";

const GLOSSARY_SYSTEM_PROMPT = `You are an expert academic translator and terminology specialist.
Your task is to identify key technical terms from academic papers and provide their standard Japanese translations.

Rules:
1. Focus on domain-specific technical terms, not common words
2. Include terms that are frequently used in the field
3. Provide standard Japanese translations used in academic contexts
4. For terms that are typically kept in English (like proper nouns), mark them appropriately
5. Output ONLY valid JSON, no explanations`;

const GLOSSARY_USER_PROMPT = `Analyze the following academic paper content and extract key technical terms with their Japanese translations.

Title: {title}

Abstract: {abstract}

Keywords: {keywords}

Output a JSON array of objects with "term" (English), "translation" (Japanese), and optional "definition" (brief explanation).

Example output:
[
  {"term": "affordance", "translation": "アフォーダンス", "definition": "環境が提供する行為の可能性"},
  {"term": "embodiment", "translation": "身体性"},
  {"term": "haptic feedback", "translation": "触覚フィードバック"}
]

Extract 10-20 key terms from this paper:`;

/**
 * Generate a glossary for a paper using LLM.
 */
export async function generateGlossary(
  provider: LLMProvider,
  title: string,
  abstract: string,
  keywords: string[] = []
): Promise<GlossaryEntry[]> {
  const prompt = GLOSSARY_USER_PROMPT
    .replace("{title}", title)
    .replace("{abstract}", abstract)
    .replace("{keywords}", keywords.join(", ") || "N/A");

  try {
    const result = await provider.complete(prompt, GLOSSARY_SYSTEM_PROMPT, {
      temperature: 0.1,
      maxTokens: 2000,
    });

    // Parse JSON response
    const jsonMatch = result.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("Failed to parse glossary JSON:", result.text);
      return [];
    }

    const entries: GlossaryEntry[] = JSON.parse(jsonMatch[0]);
    return entries;
  } catch (error) {
    console.error("Failed to generate glossary:", error);
    return [];
  }
}

/**
 * Apply glossary to translated text (post-processing).
 * 
 * This performs careful term replacement to ensure consistency
 * without breaking sentence structure.
 */
export function applyGlossary(
  text: string,
  glossary: GlossaryEntry[]
): string {
  if (!text || glossary.length === 0) return text;

  const sortedGlossary = [...glossary]
    .filter((entry) => entry.term.trim().length >= 2 && entry.translation.trim())
    .sort((a, b) => b.term.length - a.term.length);

  let result = text;

  for (const entry of sortedGlossary) {
    const term = entry.term.trim();
    const translation = entry.translation.trim();
    const parenPattern = new RegExp(
      `([^（(\\n]{0,40})[（(]${escapeRegex(term)}[）)]`,
      "gi"
    );
    result = result.replace(parenPattern, `${translation}（${term}）`);

    const wordPattern = new RegExp(
      `(?<![（(])\\b${escapeRegex(term)}\\b(?![）)])`,
      "gi"
    );
    result = result.replace(wordPattern, translation);
  }

  return result;
}

/**
 * Small source-grounded terminology repair set.
 *
 * These are established cross-paper research terms for which MADLAD can emit
 * a fluent but unrelated Japanese homophone. A replacement is allowed only
 * when the English source contains the corresponding term and the generated
 * Japanese contains a documented erroneous rendering. This is terminology
 * normalization, not an output-word blacklist: it cannot introduce a term
 * that is absent from the source.
 */
const SOURCE_GROUNDED_TERMS: Array<{
  source: RegExp;
  replacements: Array<[RegExp, string]>;
}> = [
  {
    source: /\bvignettes?\b/i,
    replacements: [[/ビニール|ビニル|ビネット/g, "ヴィネット"]],
  },
  {
    source: /\bvignette-based\b/i,
    replacements: [[/ヴィネット画像(?:のみ)?を用いた/g, "ヴィネットに基づく"]],
  },
  {
    source: /^(?:\d+(?:\.\d+)*\.?\s+)?related\s+works?\b/im,
    replacements: [[/関連作品/g, "関連研究"]],
  },
  {
    source: /\bhuman-like\b/i,
    replacements: [[/人間的に記述できる方法/g, "人間らしいと表現できる方法"]],
  },
  {
    source: /\badversarial\s+vignettes?\b/i,
    replacements: [[/対立ヴィネット/g, "敵対的ヴィネット"]],
  },
  {
    source: /\bconjunction\s+fallacy\b/i,
    replacements: [[/連想誤謬|結合誤謬/g, "連言錯誤"]],
  },
  {
    source: /\bbase[ -]?rate\s+fallacy\b/i,
    replacements: [[/基準値誤謬|基準率誤謬/g, "ベースレート錯誤"]],
  },
  {
    source: /\bmulti[ -]?armed\s+bandit\b/i,
    replacements: [[/多武装の強盗(?:のタスク)?/g, "多腕バンディット課題"]],
  },
  {
    source: /\bwearability\b/i,
    replacements: [[/ウェスタビリティ|ウェストバンド/g, "装着性"]],
  },
  {
    source: /\bwearable(?:s)?\b/i,
    replacements: [[/ウェスタブル|ウェスタビリティ|ウェストバンド/g, "ウェアラブル"]],
  },
  {
    source: /\bcounterbalanc(?:e|ed|ing)\b/i,
    replacements: [[/対比/g, "カウンターバランス"]],
  },
  {
    source: /\bearrings?\b/i,
    replacements: [[/耳かき|耳輪/g, "イヤリング"]],
  },
  {
    source: /\bless\s+embarrassing\b/i,
    replacements: [[/より恥ずかし(?:く|い)/g, "恥ずかしさが少なく"]],
  },
  {
    source: /\bless\s+impolite\b/i,
    replacements: [[/より不礼(?:で|な|に)?/g, "失礼さが少なく"]],
  },
  {
    source: /\bless\s+weird\b/i,
    replacements: [[/より奇妙(?:で|な|に)?/g, "奇妙さが少なく"]],
  },
];

export function normalizeSourceGroundedTerminology(
  source: string,
  translation: string
): string {
  let result = translation;
  for (const term of SOURCE_GROUNDED_TERMS) {
    if (!term.source.test(source)) continue;
    for (const [alias, preferred] of term.replacements) {
      result = result.replace(alias, preferred);
    }
  }
  return result;
}

/**
 * Escape special regex characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Merge glossaries, preferring newer entries.
 */
export function mergeGlossaries(
  existing: GlossaryEntry[],
  newEntries: GlossaryEntry[]
): GlossaryEntry[] {
  const merged = new Map<string, GlossaryEntry>();

  // Add existing entries
  for (const entry of existing) {
    merged.set(entry.term.toLowerCase(), entry);
  }

  // Override with new entries
  for (const entry of newEntries) {
    merged.set(entry.term.toLowerCase(), entry);
  }

  return Array.from(merged.values());
}
