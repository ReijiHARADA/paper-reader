import type { RoleCandidate } from "../generic/candidates";
import type { FormatDetection } from "../types";
import type { ExtractionEvidence } from "../types";
import { FORMAT_PROFILES } from "./index";

const ACM_HEADER =
  /^(proceedings of|conference on|extended abstracts|tei\s+[’']?\d{2,4}|chi\s+[’']?\d{2,4}|uist\s+[’']?\d{2,4}|iswc\s+[’']?\d{2,4}|dis\s+[’']?\d{2,4}|cscw|imwut|ubicomp)/i;

const ACM_COPYRIGHT = /permission to make digital or hard copies/i;
const IEEE_LICENSE = /authorized licensed use/i;

/**
 * Hard rules run only after a format is applied. They relabel chrome;
 * they do not invent a format from a single signal.
 */
export function applyFormatHardRules(
  candidates: RoleCandidate[],
  detection: FormatDetection
): { candidates: RoleCandidate[]; evidence: ExtractionEvidence[] } {
  const evidence: ExtractionEvidence[] = [];
  if (detection.applied === "generic") {
    return { candidates, evidence };
  }

  const next = candidates.map((candidate) => {
    const text = candidate.text.trim();
    if (detection.applied === "acm") {
      if (ACM_COPYRIGHT.test(text) && candidate.role !== "copyright") {
        evidence.push({
          source: "format-profile",
          label: "copyright",
          confidence: 0.95,
          page: candidate.pageStart,
          reason: "ACM permission boilerplate",
        });
        return relabel(candidate, "copyright", 0.95, "ACM permission boilerplate");
      }
      if (
        ACM_HEADER.test(text) &&
        text.length < 90 &&
        (candidate.role === "paragraph" || candidate.role === "heading")
      ) {
        evidence.push({
          source: "format-profile",
          label: "header",
          confidence: 0.9,
          page: candidate.pageStart,
          reason: "ACM venue running header",
        });
        return relabel(candidate, "header", 0.9, "ACM venue running header");
      }
    }
    if (detection.applied === "ieee") {
      if (IEEE_LICENSE.test(text)) {
        evidence.push({
          source: "format-profile",
          label: "footer",
          confidence: 0.92,
          page: candidate.pageStart,
          reason: "IEEE licensed-use footer",
        });
        return relabel(candidate, "footer", 0.92, "IEEE licensed-use footer");
      }
    }
    return candidate;
  });

  const profile = FORMAT_PROFILES.find((p) => p.id === detection.applied);
  if (profile) {
    evidence.push({
      source: "format-profile",
      label: `${detection.applied}-applied`,
      confidence: detection.scores[detection.applied],
      reason: detection.reason,
    });
  }

  return { candidates: next, evidence };
}

function relabel(
  candidate: RoleCandidate,
  role: RoleCandidate["role"],
  confidence: number,
  reason: string
): RoleCandidate {
  return {
    ...candidate,
    role,
    confidence,
    reason,
    evidence: [
      ...candidate.evidence,
      {
        source: "format-profile",
        label: role,
        confidence,
        page: candidate.pageStart,
        reason,
      },
    ],
  };
}

export function formatTitleEvidence(detection: FormatDetection): ExtractionEvidence[] {
  if (detection.applied === "generic") return [];
  return [
    {
      source: "format-profile",
      label: `${detection.applied}-title-region`,
      confidence: Math.min(0.88, detection.scores[detection.applied]),
      reason: "first-page region matches applied format profile",
    },
  ];
}
