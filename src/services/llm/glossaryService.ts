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
