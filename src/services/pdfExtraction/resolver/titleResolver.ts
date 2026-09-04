import { isGarbageTitle } from "../../translation/quality";
import { fuseTitle } from "../fusion";
import type { RoleCandidate } from "../generic/candidates";
import type { ExtractionEvidence } from "../types";

function looksLikeAuthorish(text: string): boolean {
  if (/@/.test(text)) return true;
  if (/(university|department|institute|大学|大学院)/i.test(text)) return true;
  return false;
}

function joinTitleParts(left: string, right: string): string {
  if (/[-\u2010-\u2014]$/.test(left)) {
    return `${left.replace(/[-\u2010-\u2014]+$/, "")}${right}`;
  }
  return `${left} ${right}`.replace(/\s+/g, " ").trim();
}

/**
 * Choose a native title string. Never replace healthy pdf.js text with
 * GROBID/VLM output. Joins a hyphen-truncated line with the next native block.
 */
export function resolveTitle(input: {
  candidates: RoleCandidate[];
  metadataTitle?: string;
  extra?: ExtractionEvidence[];
  grobidTitle?: string | null;
}): { text: string | null; confidence: number; evidence: ExtractionEvidence[] } {
  const titles = input.candidates.filter((c) => c.role === "title");
  let native: string[] = [];

  if (titles.length > 0) {
    let combined = titles[0].text.trim();
    for (let i = 1; i < titles.length; i++) {
      const prev = titles[i - 1];
      const cur = titles[i];
      if (cur.pageStart !== prev.pageStart) break;
      const prevBottom =
        (prev.boundingBoxes[0]?.y ?? 0) + (prev.boundingBoxes[0]?.height ?? 0);
      const gap = (cur.boundingBoxes[0]?.y ?? 0) - prevBottom;
      const prevFont = prev.layoutBlock.lines[0]?.fontSize ?? 12;
      if (gap > prevFont * 2.8) break;
      if (looksLikeAuthorish(cur.text)) break;
      combined = joinTitleParts(combined, cur.text.trim());
    }
    native = [combined];

    const last = titles[titles.length - 1];
    const lastText = native[0];
    if (/[-\u2010-\u2014]$/.test(lastText) || /\bOn-$/.test(lastText)) {
      const idx = input.candidates.findIndex((c) => c.id === last.id);
      const next = input.candidates[idx + 1];
      if (
        next &&
        next.pageStart === last.pageStart &&
        next.role !== "author" &&
        next.role !== "affiliation" &&
        next.role !== "heading" &&
        !looksLikeAuthorish(next.text)
      ) {
        native = [joinTitleParts(lastText, next.text.trim())];
      }
    }
  }

  if (native.length === 0) {
    const pageOne = input.candidates.filter(
      (c) =>
        c.pageStart === 1 &&
        c.role !== "header" &&
        c.role !== "footer" &&
        c.role !== "copyright" &&
        c.text.trim().length >= 8 &&
        c.text.trim().length <= 180 &&
        !looksLikeAuthorish(c.text)
    );
    const fallback = pageOne
      .filter((c) => c.layoutBlock.lines[0]?.fontSize)
      .sort(
        (a, b) =>
          (b.layoutBlock.lines[0]?.fontSize ?? 0) -
          (a.layoutBlock.lines[0]?.fontSize ?? 0)
      )[0];
    if (fallback && !isGarbageTitle(fallback.text)) {
      native = [fallback.text.trim()];
    }
  }

  const fused = fuseTitle(native, input.extra ?? [], input.grobidTitle);
  const meta = input.metadataTitle?.trim() || "";
  if (!fused.text && meta && !isGarbageTitle(meta)) {
    return {
      text: meta,
      confidence: 0.55,
      evidence: [
        ...fused.evidence,
        {
          source: "pdf-native",
          label: "title",
          confidence: 0.55,
          reason: "PDF metadata title fallback",
        },
      ],
    };
  }

  if (!fused.text) {
    return { text: null, confidence: 0, evidence: fused.evidence };
  }

  return {
    text: fused.text,
    confidence: fused.confidence,
    evidence: fused.evidence,
  };
}
