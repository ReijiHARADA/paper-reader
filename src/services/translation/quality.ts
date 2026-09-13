/**
 * Guardrails for what to send to MADLAD and what to keep as a translation.
 */

const THAI = /[\u0E00-\u0E7F]/;
const KANA = /[\u3040-\u30FF]/;
const KANJI = /[\u4E00-\u9FFF]/;
const HANGUL = /[\uAC00-\uD7AF]/;
const DATE_STAMP = /\d{4}-\d{2}-\d{2}/;
// Tokenizer/decode failures can surface as literal byte escapes (for example
// `<0xE9><0xA0><0x9A>`). They are not meaningful Japanese and a fluent-looking
// surrounding sentence must not make the result acceptable.
const BYTE_ESCAPE = /<0x[0-9a-f]{2}>/i;
const LEFTOVER_PLACEHOLDER = /[zζΖ][zζΖ]c[iιΙіІ]t\d+(?:x\d+)?[zζΖ][zζΖ]/i;
const SOURCE_NEGATION = /\b(?:(?:do|does|did|is|are|was|were|has|have|had)\s+not|cannot|can\s+not|never|without|lack(?:s|ed|ing)?|absence)\b/i;
const JA_NEGATION = /(?:ない|なく|なかっ|ません|ず|ぬ|無|非|不|未|欠|否)/;

/**
 * Greedy decoding occasionally repeats a fluent Japanese phrase many times.
 * Character repetition misses this failure because every character is valid.
 * Only reject a repeated phrase when it occupies a material part of the
 * output, so ordinary repeated terminology remains valid.
 */
function hasAbnormalPhraseRepetition(text: string): boolean {
  const compact = text.replace(/[^\p{L}\p{N}]/gu, "");
  if (compact.length < 36) return false;
  const counts = new Map<string, number>();
  // Five Japanese characters are enough to distinguish a repeated proposition
  // such as 「実験の結果」, while the density threshold avoids rejecting one
  // recurring technical noun in an otherwise independent translation.
  for (let index = 0; index <= compact.length - 5; index += 1) {
    const phrase = compact.slice(index, index + 5);
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
  return [...counts.entries()].some(([phrase, count]) => count >= 3 && phrase.length * count / compact.length >= 0.16);
}

function hasFragmentedJapaneseSpacing(text: string): boolean {
  const spacedJapaneseTokens = text.match(/(?:^|\s)[\u3040-\u30ff\u4e00-\u9fff]{1,2}(?=\s|$)/g) ?? [];
  if (spacedJapaneseTokens.length < 14) return false;
  const japaneseChars = (text.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) ?? []).length;
  if (japaneseChars < 40) return false;
  const compactLength = text.replace(/\s+/g, "").length;
  const whitespaceCount = (text.match(/\s/g) ?? []).length;
  // Normal Japanese prose may include spaces around citations or Latin terms,
  // but it should not look like a stream of one-character SentencePiece
  // fragments. This catches alternate-model decoder failures without naming
  // any hallucinated word.
  return spacedJapaneseTokens.length / Math.max(japaneseChars, 1) > 0.18
    && whitespaceCount / Math.max(compactLength, 1) > 0.12;
}

function hasOrphanedInvariantSentence(output: string, source: string): boolean {
  if (source.trim().length < 120) return false;
  const sentences = output
    .split(/(?<=[。！？!?])\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length < 2) return false;
  return sentences.some((sentence) => {
    const compact = sentence.replace(/\s+/g, "");
    if (compact.length < 4 || compact.length > 80) return false;
    const hasSourceFact = extractScientificInvariants(sentence).some((item) =>
      ["citation", "figure", "statistic", "measurement", "year", "acronym"].includes(item.kind)
    );
    if (!hasSourceFact) return false;
    const withoutAsciiFacts = compact
      .replace(/\[[^\]]+\]/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/[A-Za-z][A-Za-z0-9_.:/-]*/g, "")
      .replace(/\d+(?:\.\d+)?/g, "")
      .replace(/[、,;:：.。！？!?・（）()[\]\-–—+=<>≤≥≠\s]/g, "");
    return !KANA.test(withoutAsciiFacts) && !KANJI.test(withoutAsciiFacts);
  });
}

/** ACM CCS 1998-style classifier: H.5.2, H.5.m, I.2.10 */
const CCS_CODE = /[A-K]\.\d+(?:\.\d+)*(?:\.[a-z])?/i;

export type ScientificInvariant = { kind: "citation" | "doi" | "url" | "figure" | "statistic" | "measurement" | "year" | "number" | "acronym"; value: string };

export type TranslationQuality = {
  score: number;
  reasons: string[];
  languageScore: number;
  invariantScore: number;
  repetitionScore: number;
  lengthScore: number;
};

const SCIENTIFIC_PATTERNS: Array<[ScientificInvariant["kind"], RegExp]> = [
  ["url", /https?:\/\/[^\s)\]}>,。、「」]+/gi],
  ["doi", /\b10\.\d{4,9}\/[\w.()/:;-]+/gi],
  ["citation", /\[\d+(?:\s*[-–—]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–—]\s*\d+)?)*\]/g],
  // Figure/panel labels are source references. Keeping their original form is
  // safer than allowing a decoder to omit, renumber, or detach them.
  ["figure", /\bfig(?:ure)?s?\.?\s*\d+(?:[a-z]|\([a-z]\))?/gi],
  // Superscript-style references are often emitted by native PDF extraction
  // as a number adjacent to a quoted term or identifier: `problem”16 (`.
  // Treat the number as a citation only in that parenthesized-reference
  // context, never as a general integer.
  ["citation", /(?<=[”’"])[0-9]{1,3}(?=\s*\()/g],
  ["citation", /(?<=[A-Z])[0-9]{1,3}(?=\s*\()/g],
  // Calendar years are source facts in historical and longitudinal claims.
  // Keep them distinct from ordinary numbers so a fluent output cannot turn
  // “before World War I” into an invented year such as 1914.
  ["year", /\b(?:1[5-9]\d{2}|20\d{2})\b/g],
  ["statistic", /(?:[χΧxX](?:²|2)?|[FfTtZz])\s*\([^)]{1,16}\)\s*(?:=|<|>|≤|≥)\s*[-+]?\d+(?:\.\d+)?|\b[UWHV]\s*=\s*[-+]?\d+(?:\.\d+)?|\bp\s*(?:=|<|>|≤|≥)\s*\.?\d+(?:\.\d+)?|\b[A-Za-z]\s*(?:\u0338\s*=|!=|≠|=|<|>|≤|≥)\s*[-+]?\d+(?:\.\d+)?/g],
  ["measurement", /\b\d+(?:\.\d+)?\s*(?:mm|cm|m|km|ms|s|hz|khz|mhz|ghz|uw|mw|w|kg|mg|%|°c)\b/gi],
  // Preserve all-caps acronyms and mixed-case technical identifiers. The
  // latter covers model/system names such as DeepIV without treating normal
  // prose as an invariant.
  ["acronym", /\b(?:[A-Z][A-Z0-9]{1,9}|[A-Za-z]*[a-z][A-Z][A-Za-z0-9]*)\b/g],
  ["acronym", /\b[A-Z][a-z]+(?:-[a-z]+)*-[A-Z][a-z]+\b/g],
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
      if ((kind === "number" || kind === "year" || kind === "acronym") && covered.some(([left, right]) => start >= left && end <= right)) continue;
      found.push({ kind, value: match[0] });
      if (kind !== "number") covered.push([start, end]);
    }
  }
  return [...new Map(found.map((item) => [`${item.kind}:${normalizeInvariant(item.value)}`, item])).values()];
}

function normalizeInvariant(value: string): string {
  return value.toLowerCase().replace(/[\s\u00a0]/g, "").replace(/[−–—]/g, "-").replace(/\u0338=/g, "!=").replace(/≠/g, "!=");
}

function outputContainsInvariant(output: string, invariant: ScientificInvariant): boolean {
  const normalizedOutput = normalizeInvariant(output);
  const value = normalizeInvariant(invariant.value);
  if (invariant.kind !== "acronym") return normalizedOutput.includes(value);
  // `BERT` must not be treated as preserved merely because `DeBERTa` occurs.
  // Method/model identifiers are ASCII tokens even when adjacent to Japanese.
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(output);
}

function invariantQuality(source: string, output: string): { score: number; reasons: string[]; criticalMissing: boolean } {
  const invariants = extractScientificInvariants(source);
  const missing = invariants.filter((invariant) => !outputContainsInvariant(output, invariant));
  // Measurements, statistical values, references, and links are source facts.
  // A translation may express an ordinary number differently, but it must not
  // introduce a new value with a scientific unit or a new reference-like fact.
  // Checking only these structured kinds avoids rejecting ordinary Japanese
  // wording such as "first" becoming "1つ".
  const sourceFacts = new Set(
    invariants
      .filter((item) => ["citation", "doi", "url", "figure", "statistic", "measurement", "year"].includes(item.kind))
      .map((item) => `${item.kind}:${normalizeInvariant(item.value)}`)
  );
  const unexpected = extractScientificInvariants(output).filter((item) =>
    ["citation", "doi", "url", "figure", "statistic", "measurement", "year"].includes(item.kind)
      && !sourceFacts.has(`${item.kind}:${normalizeInvariant(item.value)}`)
  );
  if (missing.length === 0 && unexpected.length === 0) return { score: 1, reasons: [], criticalMissing: false };
  // A missing acronym can change the method, metric, or experimental
  // condition under discussion (for example MSE, NPIV, or DeepIV). It is a
  // safety failure, not merely a stylistic difference.
  const critical = missing.filter((item) => ["citation", "doi", "url", "figure", "statistic", "measurement", "year", "acronym"].includes(item.kind));
  const reasons: string[] = [];
  if (missing.length > 0) reasons.push(`scientific invariants missing: ${missing.slice(0, 4).map((item) => item.value).join(", ")}`);
  if (unexpected.length > 0) reasons.push(`unexpected scientific invariants: ${unexpected.slice(0, 4).map((item) => item.value).join(", ")}`);
  return {
    score: Math.max(0, 1 - missing.length / Math.max(invariants.length, 1) - critical.length * 0.18 - unexpected.length * 0.24),
    reasons,
    criticalMissing: critical.length > 0 || unexpected.length > 0,
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
  if (BYTE_ESCAPE.test(text)) return true;
  if (LEFTOVER_PLACEHOLDER.test(toHalfwidthAscii(text))) return true;
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
  if (hasAbnormalPhraseRepetition(text)) return true;
  if (hasFragmentedJapaneseSpacing(text)) return true;

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
  if (hasOrphanedInvariantSentence(out, source)) reasons.push("orphaned source invariant sentence");

  const hasKana = KANA.test(out);
  const hasKanji = KANJI.test(out);
  if (!hasKana && !hasKanji) reasons.push("no Japanese script");
  if (source.trim().length >= 40 && hasKanji && !hasKana) reasons.push("Japanese prose lacks kana");

  if (latinRatioBeyondSource(out, source) > 0.45) reasons.push("excessive new Latin text");
  // Negation changes the direction of a claim. This deliberately excludes
  // "not only" constructions and only checks explicit source negation; a
  // missing Japanese negative marker is unsafe for research results.
  if (SOURCE_NEGATION.test(source) && !JA_NEGATION.test(out)) reasons.push("source negation missing");

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
  // A many-sentence academic paragraph rendered as a very short Japanese
  // summary is usually decode-time omission. The audit corpus contains valid
  // long Japanese translations down to 0.22 of the English character count;
  // use a stricter bound only for genuinely long source paragraphs.
  const severeLongOmission = source.trim().length >= 500 && lengthRatio < 0.2;
  const lengthScore = lengthRatio < 0.12 || lengthRatio > 4 || severeLongOmission ? 0.3 : 1;
  if (lengthScore < 1) reasons.push(severeLongOmission ? "long source was implausibly shortened" : "implausible length ratio");
  const semanticSafetyScore = reasons.includes("source negation missing") ? 0.35 : 1;
  return {
    score: Math.max(0, Math.min(1, (languageScore * 0.35 + invariant.score * 0.4 + repetitionScore * 0.15 + lengthScore * 0.1) * semanticSafetyScore)),
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
  // The weighted score handles ordinary quality differences, while scientific
  // facts have an explicit hard safety check below.
  // Never accept a fluent sentence which dropped a citation, statistic,
  // measurement, DOI/URL, or method acronym. The model may be retried by the
  // caller; otherwise keeping the original is safer than changing a result.
  return !isDegenerateTranslation(output)
    && !invariantQuality(source, output).criticalMissing
    && !quality.reasons.includes("long source was implausibly shortened")
    && !quality.reasons.includes("source negation missing")
    && quality.score >= 0.8;
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
  // Author–year styles can omit a numeric reference label. Require the
  // distinctive all-caps surname/byline pattern, a second author connector,
  // and a parenthesized year so ordinary prose about people is not hidden.
  if (
    /^[A-Z][A-Z'’-]+,\s*(?:[A-Z]\.|[A-Z][a-z]+).*?\b(?:and|&)\s+[A-Z][A-Z'’-]+,.*?\((?:19|20)\d{2}\)\./.test(t)
  ) return true;
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

/**
 * Returns a reader-facing reason only when native PDF structure makes a
 * paragraph unsafe to translate. Non-prose filters such as references and
 * publisher metadata intentionally return null: they are expected skips, not
 * extraction uncertainty.
 */
export function isExpectedNonProseParagraph(text: string): boolean {
  const t = text.trim();
  if (t.length < 28) return true;
  if (looksLikeBibliographyEntry(t) || looksLikeSubjectClassification(t)) return true;
  if (/@/.test(t) || /https?:\/\//i.test(t) || /permission to make digital/i.test(t)) return true;
  if (/\b(?:accepted|received|revised|published|available\s+online)\s*:\s*(?:\d{1,2}\s+[A-Za-z]+\s+\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})\b/i.test(t)) return true;
  if (/personal\s+or\s+classroom\s+use\b.{0,140}\b(?:copies|copyright|fee)\b/i.test(t)) return true;
  if (/\barXiv:\d{4}\.\d{4,5}v?\d*/i.test(t)) return true;
  // Running headers commonly combine a paper title with a publisher page
  // marker such as `• 195:3`. They carry no sentence boundary and native PDF
  // order can otherwise present them as a paragraph on a later page.
  if (/(?:[•·]|\|)\s*\d{1,4}:\d{1,3}\s*$/.test(t)) return true;
  // Multilingual author affiliations are metadata, not source prose.  Native
  // extraction often keeps a local-language author name beside an English
  // department/university line; translating the mixed line invites invented
  // institutions.  Require a common affiliation cue and no terminal mark so
  // ordinary multilingual research prose remains eligible.
  if (/[\uac00-\ud7af]/.test(t) && /\b(?:department|school|university|institute|faculty)\b/i.test(t) && !/[.!?。！？]$/.test(t)) return true;
  if (/(?:\b[A-Z][a-z]{1,}\b\s+){4,}[A-Z][a-z]{1,}\b\s+[a-z]/.test(t)) return true;
  if (DATE_STAMP.test(t) && t.length < 80) return true;
  const words = t.split(/\s+/).filter((word) => /[A-Za-z]{3,}/.test(word));
  return words.length < 6;
}

export function unsafeParagraphStructureReason(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const noTerminal = !/[.!?。！？]$/.test(t);
  // A physical block with an unclosed quote or an unmatched parenthesis is
  // incomplete.  Do this only without terminal punctuation: PDF text can
  // contain decorative punctuation in an otherwise complete sentence.
  if (noTerminal) {
    const openingParens = (t.match(/\(/g) ?? []).length;
    const closingParens = (t.match(/\)/g) ?? []).length;
    const doubleQuotes = (t.match(/(?<!\\)"/g) ?? []).length;
    const curlyQuotes = (t.match(/[“”]/g) ?? []).length;
    if (openingParens !== closingParens || doubleQuotes % 2 !== 0 || curlyQuotes % 2 !== 0) {
      return "段落の括弧または引用符が閉じていない可能性があります";
    }
  }
  // A trailing hyphen is a physical word break, never a complete English
  // proposition. The missing suffix is unknown, so do not ask a translation
  // model to guess it (for example, `previous Theo-`).
  if (/\b[A-Za-z]{2,}-$/.test(t)) {
    return "語が途中で切れている可能性があります";
  }
  if (t.length >= 48 && noTerminal && /^(?:starting\s+from|based\s+on|using|through|by|with|from)\b/i.test(t)) {
    return "段落の末尾が欠けている可能性があります";
  }
  const closedQuote = /^(?:[\"“]).*(?:[\"”])(?:\s*\[[^\]]+\])?$/s.test(t);
  if (t.length >= 400 && noTerminal && !closedQuote && !/^(?:[-•‣▪∙*]|\d+[.)])\s+/.test(t)) {
    return "段落の末尾が欠けている可能性があります";
  }
  // A colon is an introducing delimiter, not a terminal sentence mark. The
  // missing equation, list, or definition must not be inferred by the model.
  if (noTerminal && /:\s*$/.test(t)) {
    return "段落の末尾が欠けている可能性があります";
  }
  // Figure/table sub-panels extracted as `(a) noun phrase` are captions or
  // legends. Without terminal punctuation they do not form a reliable prose
  // translation unit, even when their words happen to be English.
  if (noTerminal && /^\([a-z]\)\s+/i.test(t)) {
    return "図表のサブパネル説明が本文に混ざっている可能性があります";
  }
  // A PDF block ending immediately after an introducing verb and the first
  // capitalized token of a name (for example "We present Thermal") is a
  // physical split before the rest of the system/paper name.  It is not a
  // complete proposition, so translation would invite the model to infer the
  // missing noun phrase.  This is deliberately restricted to no-terminal
  // prose and common academic introduction verbs.
  if (noTerminal && /\b(?:we|this\s+(?:paper|work|article)|i)\s+(?:present|propose|introduce|develop|describe|evaluate|demonstrate|call)\s+[A-Z][A-Za-z0-9-]*$/i.test(t)) {
    return "段落の末尾が欠けている可能性があります";
  }
  // Lower-case connective starts are physical continuations. Upper-case
  // `To`, `For`, `But`, and `With` can begin complete scholarly sentences.
  if (/^(?:of|and|or|but|to|for|with|where|which|that)\b/.test(t) || /^[a-z][a-z-]{2,},\s+(?:and|or|but)\b/.test(t)) {
    return "段落の先頭が前段から続いている可能性があります";
  }
  // A bare lower-case phrase that also lacks sentence-ending punctuation is
  // almost always the continuation of a line/column. Lists retain their
  // marker and are excluded from this rule; common discourse abbreviations
  // remain valid starts.
  if (
    t.length >= 48 &&
    noTerminal &&
    /^[a-z]/.test(t) &&
    !/^(?:e\.g\.|i\.e\.|et\s+al\.|vs\.|in\s+(?:particular|contrast|addition),)/i.test(t)
  ) {
    return "段落の先頭が前段から続いている可能性があります";
  }
  if (/^[a-z][a-z-]{2,}\.\s+[A-Z]/.test(t) && t.length >= 180) {
    return "段落の先頭が前段から続いている可能性があります";
  }
  if (/^[a-z]/.test(t) && t.length >= 180 && !/^(?:e\.g\.|i\.e\.|et\s+al\.|vs\.|in\s+(?:particular|contrast|addition),)/i.test(t)) {
    return "段落の先頭が前段から続いている可能性があります";
  }
  if (/\b(?:the|an?)\s+(?:entire|following|same|former|latter)\s*$/i.test(t) || /\b(?:albeit|although|though|because|while|whereas|with|without|including|concerning|between|than|to|of|for|at|in|on|from|by|as)\s*$/i.test(t) || /\b(?:about|above|across|after|against|among|around|at|before|behind|below|beneath|beside|between|beyond|by|during|for|from|in|inside|into|near|of|on|onto|over|through|to|toward|under|with|within|without)\s+(?:the|a|an|this|that|these|those|its|their|our|his|her)\s*$/i.test(t) || /\b(?:is|are|was|were|be|been|being|has|have|had|do|does|did|can|could|will|would|should|may|might)\s*$/i.test(t) || /\b(?:and|or)\s+(?:standard|mean|median|confidence|statistical)\s*$/i.test(t)) {
    return "段落の末尾が欠けている可能性があります";
  }
  if (/\b[a-z]{2,}-\s+\d+(?:\.\d+)?\s+[a-z]{2,}\b/i.test(t)) {
    return "表または図の数値セルが本文に混ざっている可能性があります";
  }
  if (/\b\d+(?:\.\d+)?\s*[×x]\s*10\s+(?!\^?\d|[-–—])[a-z]/i.test(t)) {
    return "数式の指数情報が欠けている可能性があります";
  }
  return null;
}

export function shouldTranslateParagraph(text: string): boolean {
  const t = text.trim();
  if (isExpectedNonProseParagraph(t)) return false;
  // Journal mastheads often place an author byline and editorial state on one
  // native-text line.  It is publication metadata, not research prose; a
  // translation model otherwise invents a Japanese biographical event from
  // names followed by e.g. "Accepted: 27 December 2017".
  if (/\b(?:accepted|received|revised|published|available\s+online)\s*:\s*(?:\d{1,2}\s+[A-Za-z]+\s+\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})\b/i.test(t)) return false;
  // Broken first-page permission text can lose its initial "Permission" when
  // columns are interleaved. The remaining wording is still distinctive and
  // is chrome rather than research prose.
  if (/personal\s+or\s+classroom\s+use\b.{0,140}\b(?:copies|copyright|fee)\b/i.test(t)) return false;
  // A running arXiv header inside a sentence is extraction contamination, not
  // evidence the model should infer around. Preserve the original until the
  // layout repair can separate the header from the paragraph.
  if (/\barXiv:\d{4}\.\d{4,5}v?\d*/i.test(t)) return false;
  // A run of short title-cased labels embedded in otherwise ordinary prose is
  // usually a flattened figure/table legend (for example a set of task names
  // printed beside a diagram).  It has no reliable sentence boundary for a
  // translation model to infer.  Require five labels to avoid rejecting
  // normal named entities such as institutions or person names.
  if (/(?:\b[A-Z][a-z]{1,}\b\s+){4,}[A-Z][a-z]{1,}\b\s+[a-z]/.test(t)) return false;
  if (unsafeParagraphStructureReason(t)) return false;
  // Do not turn an incomplete physical block into a confident Japanese
  // sentence. Page/column stitching may repair it upstream; otherwise the
  // reader safely shows the original.
  // A leading participial setup without a terminal mark is a high-confidence
  // physical fragment (for example "Starting from the design philosophy …
  // characteristics"). Keep it as source until its continuation is stitched.
  // Do not reject every unpunctuated block: bullet lists and quotations often
  // legitimately omit a final full stop.
  if (
    t.length >= 48
    && !/[.!?。！？]$/.test(t)
    && /^(?:starting\s+from|based\s+on|using|through|by|with|from)\b/i.test(t)
  ) return false;
  // Long native-text prose without a terminal mark is almost always a
  // page/column fragment. Lists and quotations legitimately omit a final
  // period, so keep those structural forms eligible; otherwise preserve the
  // source instead of asking the model to complete a missing clause.
  const isClosedQuote = /^(?:["“]).*(?:["”])(?:\s*\[[^\]]+\])?$/s.test(t);
  if (t.length >= 400 && !/[.!?。！？]$/.test(t) && !isClosedQuote && !/^(?:[-•‣▪∙*]|\d+[.)])\s+/.test(t)) return false;
  if (/^(?:of|and|or|but|to|for|with|where|which|that)\b/.test(t)) return false;
  // A lower-case lexical fragment followed by a coordinating conjunction is
  // strong evidence that extraction started mid-sentence ("data, and ...").
  // Complete English paragraphs do not normally begin this way.
  if (/^[a-z][a-z-]{2,},\s+(?:and|or|but)\b/.test(t)) return false;
  // A lower-case word followed by a period at the physical block start is
  // normally the tail of a sentence from the preceding column/page ("data.
  // This procedure …"), not a complete paragraph start.
  if (/^[a-z][a-z-]{2,}\.\s+[A-Z]/.test(t) && t.length >= 180) return false;
  // Native academic paragraphs virtually always begin with a capital letter,
  // number, quotation mark, or bullet. A long block beginning mid-word in
  // lowercase is usually a column/page continuation ("substantially improves
  // …"), except for the common discourse abbreviations below.
  if (
    /^[a-z]/.test(t)
    && t.length >= 180
    && !/^(?:e\.g\.|i\.e\.|et\s+al\.|vs\.|in\s+(?:particular|contrast|addition),)/i.test(t)
  ) return false;
  // Likewise, these determiners/adjectives cannot end an English sentence on
  // their own. They identify a physical block cut before its final noun.
  if (/\b(?:the|an?)\s+(?:entire|following|same|former|latter)\s*$/i.test(t)) return false;
  // A preposition followed only by a determiner is also an incomplete noun
  // phrase (for example, a page break after `as previously studied in the`).
  // Complete prose needs the missing head noun before it is safe to translate.
  if (/\b(?:about|above|across|after|against|among|around|at|before|behind|below|beneath|beside|between|beyond|by|during|for|from|in|inside|into|near|of|on|onto|over|through|to|toward|under|with|within|without)\s+(?:the|a|an|this|that|these|those|its|their|our|his|her)\s*$/i.test(t)) return false;
  // Coordinators and prepositions at the physical block end require material
  // from the next column/page. Translating them independently asks the model
  // to invent that missing complement.
  if (/\b(?:albeit|although|though|because|while|whereas|with|without|including|concerning|between|than)\s*$/i.test(t)) return false;
  if (/\b(?:is|are|was|were|be|been|being|has|have|had|do|does|did|can|could|will|would|should|may|might)\s*$/i.test(t)) return false;
  // A word split around a standalone numeric cell ("dol- 2 lars") is not a
  // legitimate hyphenation. It indicates a chart/table value was interleaved
  // into prose, so preserve source rather than inventing a quantitative claim.
  // Require actual whitespace after the hyphen. Without it, ordinary model
  // identifiers such as `GPT-3, just like people` were falsely classified as
  // a broken `dol- 2 lars` table-cell splice and entire research paragraphs
  // were never submitted for translation.
  if (/\b[a-z]{2,}-\s+\d+(?:\.\d+)?\s+[a-z]{2,}\b/i.test(t)) return false;
  // Native PDF extraction can lose a superscript exponent while preserving a
  // multiplication sign ("4 × 10 distinct forms"). That is neither a valid
  // scientific-power notation nor a hyphenated dimension such as "10-minute".
  // Sending it to the model silently turns an unknown magnitude into a false
  // quantitative claim, so retain the source until extraction can recover it.
  if (/\b\d+(?:\.\d+)?\s*[×x]\s*10\s+(?!\^?\d|[-–—])[a-z]/i.test(t)) return false;
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
