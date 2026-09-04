import type { FormatId, FormatDetection, DocumentEvidence } from "../types";
import { genericProfile } from "./generic";
import { acmProfile } from "./acm";
import { ieeeProfile } from "./ieee";
import { APPLY_MARGIN, APPLY_MIN, type FormatProfile } from "./types";

export const FORMAT_PROFILES: FormatProfile[] = [
  genericProfile,
  acmProfile,
  ieeeProfile,
];

const SELECTABLE = FORMAT_PROFILES.filter((p) => p.id !== "generic");

export function detectFormat(document: DocumentEvidence): FormatDetection {
  const scores = {
    generic: 0,
    acm: 0,
    ieee: 0,
    "springer-lncs": 0,
    jstage: 0,
  } satisfies Record<FormatId, number>;

  for (const profile of SELECTABLE) {
    scores[profile.id] = profile.detect(document);
  }

  const ranked = SELECTABLE
    .map((profile) => ({ id: profile.id, score: scores[profile.id] }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1]?.score ?? 0;

  if (
    best &&
    best.score >= APPLY_MIN &&
    best.score - second >= APPLY_MARGIN
  ) {
    return {
      applied: best.id,
      scores,
      reason: `${best.id} ${best.score.toFixed(2)} (margin ${(best.score - second).toFixed(2)})`,
    };
  }

  return {
    applied: "generic",
    scores,
    reason:
      best && best.score > 0
        ? `ambiguous or weak (${best.id}=${best.score.toFixed(2)}, next=${second.toFixed(2)})`
        : "no format profile cleared the threshold",
  };
}

export { genericProfile, acmProfile, ieeeProfile };
export type { FormatProfile } from "./types";
