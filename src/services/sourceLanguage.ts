const JA_SCRIPT = /[\u3040-\u30ff\u4e00-\u9fff\uff66-\uff9d]/;

export function japaneseScriptRatio(text: string): number {
  const compact = text.replace(/\s+/g, "");
  if (!compact.length) return 0;
  let ja = 0;
  for (const ch of compact) {
    if (JA_SCRIPT.test(ch)) ja += 1;
  }
  return ja / compact.length;
}

export function looksLikeJapaneseText(text: string, minRatio = 0.18): boolean {
  return japaneseScriptRatio(text) >= minRatio;
}

export function isJapaneseSourcePaper(input: {
  title?: string | null;
  paragraphs: Array<string | null | undefined>;
}): boolean {
  const substantial = input.paragraphs
    .map((paragraph) => paragraph?.trim() ?? "")
    .filter((paragraph) => paragraph.length >= 40);
  if (substantial.length >= 3) {
    const japaneseCount = substantial.filter((paragraph) =>
      looksLikeJapaneseText(paragraph)
    ).length;
    return japaneseCount / substantial.length >= 0.45;
  }
  const blob = [input.title ?? "", ...substantial].join("\n");
  return looksLikeJapaneseText(blob, 0.2);
}
