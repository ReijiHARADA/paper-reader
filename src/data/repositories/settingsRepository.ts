import type { GlossaryEntry } from "../../services/llm/types";
import type { TranslationCacheEntry } from "../../services/translation/types";
import type { BenchmarkEntry } from "../types/benchmark";
import type { SqliteClient } from "../sqlite/client";

export function saveSettingRow(db: SqliteClient, key: string, value: unknown): void {
  db.exec(
    "INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json",
    [key, JSON.stringify(value)]
  );
}

export function getSettingRow<T>(db: SqliteClient, key: string): T | undefined {
  const row = db.get("SELECT value_json FROM settings WHERE key = ?", [key]);
  if (!row?.value_json || typeof row.value_json !== "string") return undefined;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return undefined;
  }
}

export function saveGlossaryRow(
  db: SqliteClient,
  paperId: string,
  entries: GlossaryEntry[],
  createdAt?: string
): void {
  const now = new Date().toISOString();
  db.exec(
    `INSERT INTO glossaries (paper_id, entries_json, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(paper_id) DO UPDATE SET entries_json=excluded.entries_json, updated_at=excluded.updated_at`,
    [paperId, JSON.stringify(entries), createdAt ?? now, now]
  );
}

export function getGlossaryRow(db: SqliteClient, paperId: string): GlossaryEntry[] {
  const row = db.get("SELECT entries_json FROM glossaries WHERE paper_id = ?", [paperId]);
  if (!row?.entries_json || typeof row.entries_json !== "string") return [];
  try {
    return JSON.parse(row.entries_json) as GlossaryEntry[];
  } catch {
    return [];
  }
}

export function getCachedTranslationRow(
  db: SqliteClient,
  textHash: string,
  model: string,
  modelVersion: string,
  sourceLanguage: string,
  targetLanguage: string
): string | null {
  const row = db.get("SELECT * FROM translation_cache WHERE text_hash = ?", [textHash]);
  if (
    row &&
    row.model === model &&
    row.model_version === modelVersion &&
    row.source_language === sourceLanguage &&
    row.target_language === targetLanguage
  ) {
    return String(row.translated_text);
  }
  return null;
}

export function saveTranslationCacheRow(
  db: SqliteClient,
  textHash: string,
  entry: Omit<TranslationCacheEntry, "textHash" | "cachedAt">
): void {
  db.exec(
    `INSERT INTO translation_cache (
      text_hash, model, model_version, source_language, target_language, translated_text, cached_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(text_hash) DO UPDATE SET
      model=excluded.model,
      model_version=excluded.model_version,
      source_language=excluded.source_language,
      target_language=excluded.target_language,
      translated_text=excluded.translated_text,
      cached_at=excluded.cached_at`,
    [
      textHash,
      entry.model,
      entry.modelVersion,
      entry.sourceLanguage,
      entry.targetLanguage,
      entry.translatedText,
      Date.now(),
    ]
  );
}

export function clearTranslationCacheRows(db: SqliteClient, model?: string): number {
  if (model) {
    const rows = db.query("SELECT text_hash FROM translation_cache WHERE model = ?", [model]);
    db.exec("DELETE FROM translation_cache WHERE model = ?", [model]);
    return rows.length;
  }
  const count = db.get<{ n: number }>("SELECT COUNT(*) as n FROM translation_cache");
  db.exec("DELETE FROM translation_cache");
  return Number(count?.n ?? 0);
}

export function saveBenchmarkRow(db: SqliteClient, entry: BenchmarkEntry): void {
  db.exec(
    `INSERT INTO benchmarks (
      id, paper_id, model, model_version, input_chars, input_tokens, output_chars,
      translation_time_ms, chars_per_sec, tokens_per_sec, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      paper_id=excluded.paper_id,
      model=excluded.model,
      model_version=excluded.model_version,
      input_chars=excluded.input_chars,
      input_tokens=excluded.input_tokens,
      output_chars=excluded.output_chars,
      translation_time_ms=excluded.translation_time_ms,
      chars_per_sec=excluded.chars_per_sec,
      tokens_per_sec=excluded.tokens_per_sec,
      timestamp=excluded.timestamp`,
    [
      entry.id,
      entry.paperId,
      entry.model,
      entry.modelVersion,
      entry.inputChars,
      entry.inputTokens,
      entry.outputChars,
      entry.translationTimeMs,
      entry.charsPerSec,
      entry.tokensPerSec,
      entry.timestamp,
    ]
  );
}

export function listBenchmarksByPaper(db: SqliteClient, paperId: string): BenchmarkEntry[] {
  return db.query("SELECT * FROM benchmarks WHERE paper_id = ?", [paperId]).map(benchmarkFromRow);
}

export function listBenchmarksByModel(db: SqliteClient, model: string): BenchmarkEntry[] {
  return db.query("SELECT * FROM benchmarks WHERE model = ?", [model]).map(benchmarkFromRow);
}

export function listAllBenchmarks(db: SqliteClient): BenchmarkEntry[] {
  return db.query("SELECT * FROM benchmarks ORDER BY timestamp").map(benchmarkFromRow);
}

function benchmarkFromRow(row: Record<string, unknown>): BenchmarkEntry {
  return {
    id: String(row.id),
    paperId: String(row.paper_id),
    model: String(row.model),
    modelVersion: String(row.model_version),
    inputChars: Number(row.input_chars),
    inputTokens: row.input_tokens == null ? null : Number(row.input_tokens),
    outputChars: Number(row.output_chars),
    translationTimeMs: Number(row.translation_time_ms),
    charsPerSec: Number(row.chars_per_sec),
    tokensPerSec: row.tokens_per_sec == null ? null : Number(row.tokens_per_sec),
    timestamp: String(row.timestamp),
  };
}
