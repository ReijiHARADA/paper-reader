export type SetScores = {
  precision: number;
  recall: number;
  f1: number;
};

export function normalizeTitle(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleExactMatch(predicted: string, expected: string): boolean {
  return normalizeTitle(predicted) === normalizeTitle(expected);
}

function tokenSet(values: string[]): Set<string> {
  return new Set(values.map(normalizeTitle).filter(Boolean));
}

export function setScores(predicted: string[], expected: string[]): SetScores {
  const pred = tokenSet(predicted);
  const gold = tokenSet(expected);
  if (gold.size === 0 && pred.size === 0) {
    return { precision: 1, recall: 1, f1: 1 };
  }
  if (gold.size === 0) return { precision: 0, recall: 1, f1: 0 };
  if (pred.size === 0) return { precision: 1, recall: 0, f1: 0 };
  let hit = 0;
  for (const value of pred) {
    if (gold.has(value)) hit += 1;
  }
  const precision = hit / pred.size;
  const recall = hit / gold.size;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

export function substringRecall(predicted: string[], expected: string[]): number {
  if (expected.length === 0) return 1;
  let hit = 0;
  for (const gold of expected) {
    const needle = gold.toLowerCase();
    if (predicted.some((p) => p.toLowerCase().includes(needle))) hit += 1;
  }
  return hit / expected.length;
}

export function pairwiseOrderAccuracy(
  sequence: string[],
  orderedPairs: [string, string][]
): number {
  if (orderedPairs.length === 0) return 1;
  const haystack = sequence.join("\n").toLowerCase();
  let ok = 0;
  for (const [a, b] of orderedPairs) {
    const ia = haystack.indexOf(a.toLowerCase());
    const ib = haystack.indexOf(b.toLowerCase());
    if (ia >= 0 && ib > ia) ok += 1;
  }
  return ok / orderedPairs.length;
}

export function relationAccuracy(
  predicted: Array<{ from: string; to: string }>,
  expected: Array<{ from: string; to: string }>
): number {
  if (expected.length === 0) return predicted.length === 0 ? 1 : 0;
  const key = (r: { from: string; to: string }) =>
    `${normalizeTitle(r.from)}=>${normalizeTitle(r.to)}`;
  const pred = new Set(predicted.map(key));
  let hit = 0;
  for (const rel of expected) {
    if (pred.has(key(rel))) hit += 1;
  }
  return hit / expected.length;
}

/** Character error rate when OCR is used. Empty gold → 0. */
export function characterErrorRate(predicted: string, expected: string): number {
  if (!expected) return 0;
  const a = predicted;
  const b = expected;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array<number>(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length] / b.length;
}
