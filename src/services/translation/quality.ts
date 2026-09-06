/**
 * Guardrails for what to send to MADLAD and what to keep as a translation.
 */

const THAI = /[\u0E00-\u0E7F]/;
const KANA = /[\u3040-\u30FF]/;
const KANJI = /[\u4E00-\u9FFF]/;
const HANGUL = /[\uAC00-\uD7AF]/;
const DATE_STAMP = /\d{4}-\d{2}-\d{2}/;

/** ACM CCS 1998-style classifier: H.5.2, H.5.m, I.2.10 */
const CCS_CODE = /[A-K]\.\d+(?:\.\d+)*(?:\.[a-z])?/i;

export type ScientificInvariant = { kind: "citation" | "doi" | "url" | "statistic" | "measurement" | "number" | "acronym"; value: string };

export type TranslationQuality = {
  score: number;
  reasons: string[];
  languageScore: number;
  invariantScore: number;
  repetitionScore: number;
  lengthScore: number;
};

const SCIENTIFIC_PATTERNS: Array<[ScientificInvariant["kind"], RegExp]> = [
  ["url", /https?:\/\/[^\s)\]}>,]+/gi],
  ["doi", /\b10\.\d{4,9}\/[\w.()/:;-]+/gi],
  ["citation", /\[\d+(?:\s*[-–—]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–—]\s*\d+)?)*\]/g],
  ["statistic", /(?:[χΧxX²]|[FfTtZz])\s*\([^)]{1,16}\)\s*(?:=|<|>|≤|≥)\s*[-+]?\d+(?:\.\d+)?|\bp\s*(?:=|<|>|≤|≥)\s*\.?\d+/g],
  ["measurement", /\b\d+(?:\.\d+)?\s*(?:mm|cm|m|km|ms|s|hz|khz|mhz|ghz|kg|mg|%|°c)\b/gi],
  ["acronym", /\b[A-Z][A-Z0-9]{1,9}\b/g],
  ["number", /\b\d+(?:\.\d+)?\b/g],
];

export function extractScientificInvariants(source: string): ScientificInvariant[] {
  const found: ScientificInvariant[] = [];
  const covered: Array<[number, number]> = [];
  for (const [kind, pattern] of SCIENTIFIC_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      // Do not also record each component number inside a protected statistic.
      if (kind === "number" && covered.some(([left, right]) => start >= left && end <= right)) continue;
      found.push({ kind, value: match[0] });
      if (kind !== "number") covered.push([start, end]);
    }
  }
  return [...new Map(found.map((item) => [`${item.kind}:${normalizeInvariant(item.value)}`, item])).values()];
}

function normalizeInvariant(value: string): string {
  return value.toLowerCase().replace(/[\s\u00a0]/g, "").replace(/[−–—]/g, "-");
}

function invariantQuality(source: string, output: string): { score: number; reasons: string[] } {
  const invariants = extractScientificInvariants(source);
  if (invariants.length === 0) return { score: 1, reasons: [] };
  const normalized = normalizeInvariant(output);
  const missing = invariants.filter((invariant) => !normalized.includes(normalizeInvariant(invariant.value)));
  if (missing.length === 0) return { score: 1, reasons: [] };
  const critical = missing.filter((item) => ["citation", "doi", "url", "statistic", "measurement"].includes(item.kind));
  return {
    score: Math.max(0, 1 - missing.length / invariants.length - critical.length * 0.18),
    reasons: [`scientific invariants missing: ${missing.slice(0, 4).map((item) => item.value).join(", ")}`],
  };
}

export function looksLikeFrontMatterLabel(text: string): boolean {
  return /^(?:(?:\d+[.)]\s*)?(?:author\s+keywords?|keywords?|ccs\s+concepts?|acm\s+classification\s+keywords?|index\s+terms?|categories?(?:\s+and\s+subject\s+descriptors?)?))\s*$/i.test(
    text.trim()
  );
}

/**
 * Subject-classification / CCS catalog lines, not body prose.
 * Matches ACM CCS 1998 codes (including the miscellaneous letter suffix),
 * CCS 2012 concept trees, and IEEE-style index-term labels.
 */
export function looksLikeSubjectClassification(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 320) return false;
  if (/[→⟶]/.test(t) && /(?:^|[•·‣∙*])/.test(t)) return true;
  if (
    /^(?:index\s+terms?|keywords?|ccs\s+concepts?|acm\s+classification\s+keywords?)\s*[—–:\-]\s*\S/i.test(
      t
    )
  ) {
    return true;
  }

  const start = t.match(new RegExp(`^(${CCS_CODE.source})\\b`, "i"));
  if (!start) return false;

  const codes = t.match(new RegExp(CCS_CODE.source, "gi")) ?? [];
  if (codes.length >= 2) return true;

  const after = t.slice(start[0].length).replace(/^[.\s]+/, "");
  if (!after) return true;
  if (!/^[A-Z(]/.test(after)) return false;
  if (after.split(/\s+/).length > 24) return false;
  return true;
}

export function toHalfwidthAscii(text: string): string {
  return text
    .replace(/[\uFF01-\uFF5E]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .replace(/\u3000/g, " ")
    .replace(/([,;:])(?=[\u3040-\u30FF\u4E00-\u9FFF])/g, "$1 ");
}

export function isDegenerateTranslation(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  if (!compact) return true;
  if (/(.)\1{7,}/u.test(compact)) return true;
  if (THAI.test(text) || HANGUL.test(text)) return true;

  const counts = new Map<string, number>();
  for (const ch of compact) {
    counts.set(ch, (counts.get(ch) || 0) + 1);
  }
  const max = Math.max(...counts.values());
  if (compact.length >= 16 && max / compact.length > 0.4) return true;

  const uniqueRatio = counts.size / compact.length;
  if (compact.length >= 40 && uniqueRatio < 0.08) return true;

  return false;
}

export function isGarbageTitle(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (DATE_STAMP.test(t) && t.length < 80) return true;
  if (/proceedings of/i.test(t)) return true;
  if (/^(acm|ieee|tei|chi)\s+\d{4}/i.test(t)) return true;
  if (/没留下|请联系/.test(t)) return true;
  if (isDegenerateTranslation(t)) return true;
  return false;
}

export function evaluateJaTranslation(output: string, source: string): TranslationQuality {
  const out = output.trim();
  const reasons: string[] = [];
  if (!out) return { score: 0, reasons: ["empty output"], languageScore: 0, invariantScore: 0, repetitionScore: 0, lengthScore: 0 };
  if (isDegenerateTranslation(out)) reasons.push("degenerate output");
  if (DATE_STAMP.test(out) && !DATE_STAMP.test(source)) reasons.push("unexpected date");
  if (out === source.trim()) reasons.push("source echo");

  const hasKana = KANA.test(out);
  const hasKanji = KANJI.test(out);
  if (!hasKana && !hasKanji) reasons.push("no Japanese script");
  if (source.trim().length >= 40 && hasKanji && !hasKana) reasons.push("Japanese prose lacks kana");

  if (latinRatioBeyondSource(out, source) > 0.45) reasons.push("excessive new Latin text");

  if (
    /^\d+[.)]\s+\S/.test(source.trim()) &&
    /^\d+\s*(つの|つ。|日目|番目|個の)/.test(out)
  ) {
    reasons.push("numbered source was mistranslated as a list item");
  }
  const invariant = invariantQuality(source, out);
  reasons.push(...invariant.reasons);
  const languageScore = reasons.some((reason) => /Japanese|Latin|source echo|date|empty/.test(reason)) ? 0.15 : 1;
  const repetitionScore = isDegenerateTranslation(out) ? 0 : 1;
  const lengthRatio = out.length / Math.max(source.trim().length, 1);
  const lengthScore = lengthRatio < 0.12 || lengthRatio > 4 ? 0.3 : 1;
  if (lengthScore < 1) reasons.push("implausible length ratio");
  return {
    score: Math.max(0, Math.min(1, languageScore * 0.35 + invariant.score * 0.4 + repetitionScore * 0.15 + lengthScore * 0.1)),
    reasons,
    languageScore,
    invariantScore: invariant.score,
    repetitionScore,
    lengthScore,
  };
}

export function isPlausibleJaTranslation(output: string, source: string): boolean {
  const quality = evaluateJaTranslation(output, source);
  // A preserved grant name or researcher name may legitimately remain Latin.
  // The weighted invariant score is authoritative; hard failures score below
  // this threshold, while safe academic translations are not over-rejected.
  return quality.score >= 0.8;
}

/**
 * Figure captions that only name an artwork and its creator often should keep
 * those proper nouns verbatim. MADLAD does that correctly, but the result has
 * no Japanese script and would otherwise be recorded as a failed translation.
 */
export function localizeNamedFigureCaption(source: string): string | null {
  const match = source
    .trim()
    .match(/^(?:figure|fig\.?)[\s]+(\d+)\.\s*(.+?)\s+by\s+(.+?)[.]?$/i);
  if (!match) return null;
  const [, number, title, creator] = match;
  if (!title.trim() || !creator.trim()) return null;
  return `図${number}. ${title.trim()}（${creator.trim()}）`;
}

function latinRatioBeyondSource(output: string, source: string): number {
  const tokens = source.match(/[A-Za-z]{2,}/g) ?? [];
  let stripped = output;
  for (const token of [...tokens].sort((a, b) => b.length - a.length)) {
    stripped = stripped.replace(
      new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
      ""
    );
  }
  stripped = stripped.replace(/\d+(?:\.\d+)*/g, "");
  const compact = stripped.replace(/\s+/g, "");
  if (compact.length < 8) return 0;
  const latin = (compact.match(/[A-Za-z]/g) || []).length;
  return latin / compact.length;
}

export function looksLikeNamedWorkHeading(text: string): boolean {
  return /^(?:\d+(?:\.\d+)*[.)]\s+)?.{1,80}?\s+by\s+[A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){0,5}\s*$/.test(
    text.trim()
  );
}

export function formatNamedWorkHeading(text: string): string {
  const match = text
    .trim()
    .match(
      /^(?:(\d+(?:\.\d+)*)[.)]\s+)?(.+?)\s+by\s+(.+)$/i
    );
  if (!match) return text.trim();
  const num = match[1];
  const title = match[2].trim();
  const author = match[3].trim().replace(/[.:;]+$/, "");
  const body = `${title} (${author})`;
  return num ? `${num}. ${body}` : body;
}

export function isReferencesHeading(text: string): boolean {
  return /^(?:\d+[.)]\s*)?(references|bibliography|works cited|literature cited|参考文献|引用文献)\s*$/i.test(
    toHalfwidthAscii(text).trim()
  );
}

export function looksLikeBibliographyEntry(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^\[\d+\]/.test(t)) return true;
  if (/^\d+\.\s+[A-Z]/.test(t)) {
    if (/\b(19|20)\d{2}\b/.test(t)) return true;
    if (/\b[A-Z]\.\s+[A-Z]/.test(t)) return true;
    if (/\band\b/.test(t) && /[A-Z][a-z]+\s+[A-Z]/.test(t)) return true;
  }
  if (
    /\b(in proceedings|proc\.|extended abstracts|journal of|transactions on|doi:\s*10\.|https?:\/\/doi|retrieved .{0,24} from|acm conference|ieee )/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /\b(19|20)\d{2}\.\s+\S/.test(t) &&
    /\b(in proceedings|proc\.|journal|conference|acm|ieee|doi|isbn|pp\.|vol\.)/i.test(t)
  ) {
    return true;
  }
  if (
    /\b(arnoldsche|springer|elsevier|wiley|lark jewelry|black dog publishing|010 publishers)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /\bIn [A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,6},/.test(t) &&
    (/\(eds?\.\)/.test(t) || /,\s+[A-Z]\.\s/.test(t))
  ) {
    return true;
  }
  return false;
}

export function shouldTranslateHeading(text: string): boolean {
  const t = text.trim();
  if (t.length < 3 || t.length > 140) return false;
  if (isGarbageTitle(t)) return false;
  if (isReferencesHeading(t)) return false;
  if (looksLikeBibliographyEntry(t)) return false;
  if (looksLikeNamedWorkHeading(t)) return false;
  if (looksLikeFrontMatterLabel(t)) return false;
  if (looksLikeSubjectClassification(t)) return false;
  if (/^[\d.\s]+$/.test(t)) return false;
  return /[A-Za-z]{3,}/.test(t);
}

export function shouldTranslateParagraph(text: string): boolean {
  const t = text.trim();
  if (t.length < 28) return false;
  if (looksLikeBibliographyEntry(t)) return false;
  if (looksLikeSubjectClassification(t)) return false;
  if (/@/.test(t)) return false;
  if (/https?:\/\//i.test(t)) return false;
  if (/permission to make digital/i.test(t)) return false;
  if (DATE_STAMP.test(t) && t.length < 80) return false;
  const words = t.split(/\s+/).filter((w) => /[A-Za-z]{3,}/.test(w));
  return words.length >= 6;
}

export function shouldTranslateCaption(text: string): boolean {
  const t = toHalfwidthAscii(text)
    .trim()
    .replace(/^(?:figure|fig\.?|tables?|図|表)\s+\S+\s*[:.：–—-]?\s*/i, "");
  if (t.length < 8) return false;
  if (looksLikeBibliographyEntry(t)) return false;
  return /[A-Za-z]{3,}/.test(t);
}

export function shouldTranslateTitle(text: string): boolean {
  const t = text.trim();
  if (!shouldTranslateHeading(t) && t.length < 8) return false;
  if (isGarbageTitle(t)) return false;
  if (/@/.test(t)) return false;
  if (/^[\d.\s]+$/.test(t)) return false;
  if (/^\d{2,}(?:\.\d+){2,}/.test(t)) return false;
  return t.length >= 8 && t.length <= 220;
}

export function pickPaperTitle(
  metadataTitle: string | undefined,
  extractedTitle: string | undefined
): string | null {
  const extracted = extractedTitle?.trim() || "";
  const meta = metadataTitle?.trim() || "";
  if (extracted && !isGarbageTitle(extracted)) return extracted;
  if (meta && !isGarbageTitle(meta)) return meta;
  return extracted || null;
}

export function pickPublication(metadataTitle: string | undefined): string | null {
  const meta = metadataTitle?.trim() || "";
  if (/proceedings of/i.test(meta)) return meta;
  return null;
}

export function titleTranslationComplete(
  original: string,
  translated: string | null | undefined
): boolean {
  if (!translated || !isPlausibleJaTranslation(translated, original)) return false;
  const rest = original.split(":").slice(1).join(":").trim();
  if (rest.length >= 4 && !/[:：]/.test(translated)) return false;
  return true;
}

export function usableTranslatedText(
  translated: string | null | undefined,
  original: string | null | undefined
): string | null {
  if (!translated) return null;
  if (!isPlausibleJaTranslation(translated, original || translated)) return null;
  return toHalfwidthAscii(translated);
}

export function sectionDisplayTitle(section: {
  originalTitle: string;
  translatedTitle: string | null;
  normalizedKind?: string;
}): string {
  if (
    section.normalizedKind === "references" ||
    isReferencesHeading(section.originalTitle) ||
    looksLikeBibliographyEntry(section.originalTitle)
  ) {
    return section.originalTitle;
  }
  if (looksLikeFrontMatterLabel(section.originalTitle) || looksLikeSubjectClassification(section.originalTitle)) {
    return section.originalTitle;
  }
  if (looksLikeNamedWorkHeading(section.originalTitle)) {
    return formatNamedWorkHeading(section.originalTitle);
  }
  return (
    usableTranslatedText(section.translatedTitle, section.originalTitle) ||
    section.originalTitle
  );
}

export function displayPaperTitle(paper: {
  titleTranslated: string | null;
  titleOriginal: string | null;
}): string {
  const ja = usableTranslatedText(paper.titleTranslated, paper.titleOriginal || "");
  if (ja) return ja;
  const original = paper.titleOriginal?.trim() || "";
  if (original && !isGarbageTitle(original)) return original;
  return "無題";
}
