import type { Evidence, TitleFusion } from "./types";

function normalizeTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SOURCE_WEIGHT: Record<Evidence["source"], number> = {
  "pdf-native": 1,
  "generic-heuristic": 0.75,
  "format-profile": 0.35,
  grobid: 0.9,
  "layout-model": 0.8,
  ocr: 0.45,
};

/**
 * Choose among native title strings. GROBID / layout / profile may vote,
 * but they do not replace a healthy native candidate with generated text.
 */
export function fuseTitle(
  nativeCandidates: string[],
  extra: Evidence[],
  grobidTitle?: string | null
): TitleFusion {
  const natives = nativeCandidates.map((text) => text.trim()).filter(Boolean);
  if (natives.length === 0) {
    const fallback = grobidTitle?.trim() ?? "";
    return {
      text: fallback,
      confidence: fallback ? 0.45 : 0,
      evidence: extra,
    };
  }

  const grobidNorm = grobidTitle ? normalizeTitle(grobidTitle) : "";
  let best = natives[0];
  let bestScore = -1;
  const evidence: Evidence[] = [
    ...natives.map((text) => ({
      source: "generic-heuristic" as const,
      label: "title",
      confidence: 0.8,
      note: text.slice(0, 80),
    })),
    ...extra,
  ];

  for (const candidate of natives) {
    const norm = normalizeTitle(candidate);
    let score = 0.8;
    if (grobidNorm && (norm === grobidNorm || grobidNorm.includes(norm) || norm.includes(grobidNorm))) {
      score += 0.12;
    }
    for (const item of extra) {
      if (item.label === "title" || item.label.endsWith("-title-region")) {
        score += item.confidence * SOURCE_WEIGHT[item.source] * 0.08;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (grobidTitle) {
    evidence.push({
      source: "grobid",
      label: "title",
      confidence: 0.9,
      note: grobidTitle.slice(0, 80),
    });
  }

  return {
    text: best,
    confidence: Math.min(0.99, Math.max(0.5, bestScore)),
    evidence,
  };
}

export function fuseBinaryLabel(
  votes: Evidence[],
  positive: string
): { label: string; confidence: number; evidence: Evidence[] } {
  const relevant = votes.filter((v) => v.label === positive || v.label.startsWith(positive));
  if (relevant.length === 0) {
    return { label: "unknown", confidence: 0, evidence: votes };
  }
  const weighted =
    relevant.reduce((sum, v) => sum + v.confidence * SOURCE_WEIGHT[v.source], 0) /
    relevant.reduce((sum, v) => sum + SOURCE_WEIGHT[v.source], 0);
  return { label: positive, confidence: Math.min(0.99, weighted), evidence: relevant };
}
