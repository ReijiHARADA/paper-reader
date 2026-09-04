/**
 * Guardrails for what to send to MADLAD and what to keep as a translation.
 */

const THAI = /[\u0E00-\u0E7F]/;
const KANA = /[\u3040-\u30FF]/;
const KANJI = /[\u4E00-\u9FFF]/;
const HANGUL = /[\uAC00-\uD7AF]/;
const DATE_STAMP = /\d{4}-\d{2}-\d{2}/;
const CCS_CONCEPT = /^[A-Z](?:\.\d+[a-z]?)+\b/;

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

export function isPlausibleJaTranslation(output: string, source: string): boolean {
  const out = output.trim();
  if (!out) return false;
  if (isDegenerateTranslation(out)) return false;
  if (DATE_STAMP.test(out) && !DATE_STAMP.test(source)) return false;
  if (out === source.trim()) return false;

  const hasKana = KANA.test(out);
  const hasKanji = KANJI.test(out);
  if (!hasKana && !hasKanji) return false;
  if (source.trim().length >= 40 && hasKanji && !hasKana) return false;

  if (latinRatioBeyondSource(out, source) > 0.45) return false;

  if (
    /^\d+[.)]\s+\S/.test(source.trim()) &&
    /^\d+\s*(つの|つ。|日目|番目|個の)/.test(out)
  ) {
    return false;
  }
  return true;
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
  return /^(?:\d+[.)]\s*)?(references|bibliography|works cited|literature cited)\s*$/i.test(
    text.trim()
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
  if (CCS_CONCEPT.test(t)) return false;
  if (/^ccs\s+concepts?/i.test(t)) return false;
  if (/^[\d.\s]+$/.test(t)) return false;
  return /[A-Za-z]{3,}/.test(t);
}

export function shouldTranslateParagraph(text: string): boolean {
  const t = text.trim();
  if (t.length < 28) return false;
  if (looksLikeBibliographyEntry(t)) return false;
  if (CCS_CONCEPT.test(t)) return false;
  if (/@/.test(t)) return false;
  if (/https?:\/\//i.test(t)) return false;
  if (/permission to make digital/i.test(t)) return false;
  if (DATE_STAMP.test(t) && t.length < 80) return false;
  const words = t.split(/\s+/).filter((w) => /[A-Za-z]{3,}/.test(w));
  return words.length >= 6;
}

export function shouldTranslateCaption(text: string): boolean {
  const t = text.trim().replace(/^(?:figure|fig\.?|tables?)\s+\S+\s*[:.–—-]?\s*/i, "");
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
