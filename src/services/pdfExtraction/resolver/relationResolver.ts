import { displayHeadingText } from "../../pdfLayout";
import type { CanonicalNode, CanonicalRelation } from "../canonical/types";
import type { RoleCandidate } from "../generic/candidates";

function headingLevel(text: string, fontSize: number, baseFont: number): number {
  const match = displayHeadingText(text).match(/^(\d+)(\.(\d+))?(\.(\d+))?/);
  if (match) {
    if (match[5]) return 3;
    if (match[3]) return 2;
    return 1;
  }
  if (fontSize > baseFont * 1.3) return 1;
  if (fontSize > baseFont * 1.15) return 2;
  return 1;
}

function numberingParts(text: string): number[] | null {
  const match = displayHeadingText(text).match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [match[1], match[3], match[5]]
    .filter(Boolean)
    .map((n) => Number(n));
}

function prefixOf(child: number[], parent: number[]): boolean {
  if (parent.length >= child.length) return false;
  return parent.every((n, i) => n === child[i]);
}

export function childOfRelations(
  headingNodes: CanonicalNode[],
  baseFont: number
): CanonicalRelation[] {
  const relations: CanonicalRelation[] = [];
  const numbered: { node: CanonicalNode; parts: number[] }[] = [];
  const stack: { id: string; level: number }[] = [];

  for (const node of headingNodes) {
    const font = 12;
    const level = headingLevel(node.text ?? "", font, baseFont);
    const parts = numberingParts(node.text ?? "");
    if (parts) {
      const parent = [...numbered]
        .reverse()
        .find((prev) => prefixOf(parts, prev.parts));
      if (parent) {
        relations.push({
          kind: "CHILD_OF",
          from: node.id,
          to: parent.node.id,
          score: 0.9,
        });
      } else {
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }
        if (stack.length > 0) {
          relations.push({
            kind: "CHILD_OF",
            from: node.id,
            to: stack[stack.length - 1].id,
            score: 0.7,
          });
        }
      }
      numbered.push({ node, parts });
    } else {
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      if (stack.length > 0) {
        relations.push({
          kind: "CHILD_OF",
          from: node.id,
          to: stack[stack.length - 1].id,
          score: 0.65,
        });
      }
    }
    stack.push({ id: node.id, level });
  }
  return relations;
}

function markersFrom(text: string): string[] {
  const cleaned = text.trim();
  const found = new Set<string>();
  for (const match of cleaned.matchAll(/([A-Za-z\u3040-\u9fff][A-Za-z.\u3040-\u9fff'-]*)([*†‡§]|\d{1,2})\b/g)) {
    found.add(match[2]);
  }
  const leading = cleaned.match(/^([*†‡§]|\d{1,2})[.\s]/);
  if (leading) found.add(leading[1]);
  return [...found];
}

export function affiliatedWithRelations(nodes: CanonicalNode[]): CanonicalRelation[] {
  const authors = nodes.filter((n) => n.role === "author");
  const affiliations = nodes.filter((n) => n.role === "affiliation");
  const relations: CanonicalRelation[] = [];
  if (authors.length === 0 || affiliations.length === 0) return relations;

  let linked = false;
  for (const author of authors) {
    const marks = markersFrom(author.text ?? "");
    for (const aff of affiliations) {
      const affMarks = markersFrom(aff.text ?? "");
      const affStarts = (aff.text ?? "").trim().match(/^([*†‡§]|\d{1,2})\b/);
      const key = affStarts?.[1];
      if (marks.length > 0 && (affMarks.includes(marks[0]) || (key && marks.includes(key)))) {
        relations.push({
          kind: "AFFILIATED_WITH",
          from: author.id,
          to: aff.id,
          score: 0.86,
        });
        linked = true;
      }
    }
  }

  if (!linked) {
    if (affiliations.length === 1) {
      for (const author of authors) {
        relations.push({
          kind: "AFFILIATED_WITH",
          from: author.id,
          to: affiliations[0].id,
          score: 0.6,
        });
      }
    } else if (authors.length === affiliations.length) {
      authors.forEach((author, i) => {
        relations.push({
          kind: "AFFILIATED_WITH",
          from: author.id,
          to: affiliations[i].id,
          score: 0.55,
        });
      });
    }
  }
  return relations;
}

function overlapRatio(a: { x: number; width: number }, b: { x: number; width: number }): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const w = Math.max(0, right - left);
  return w / Math.max(Math.min(a.width, b.width), 1);
}

export function captionOfRelations(nodes: CanonicalNode[]): CanonicalRelation[] {
  const captions = nodes.filter((n) => n.role === "caption");
  const figures = nodes.filter((n) => n.role === "figure" || n.role === "table");
  const relations: CanonicalRelation[] = [];
  const used = new Set<string>();

  for (const caption of captions) {
    const captionBox = caption.boundingBoxes[0];
    let best: { node: CanonicalNode; score: number } | null = null;
    for (const figure of figures) {
      if (used.has(figure.id)) continue;
      if (figure.pageStart !== caption.pageStart) continue;
      const figBox = figure.boundingBoxes[0];
      if (!captionBox || !figBox) continue;
      let score = 0.4;
      if (figure.column && caption.column && figure.column === caption.column) {
        score += 0.2;
      }
      const dy = captionBox.y - (figBox.y + figBox.height);
      if (dy >= -8 && dy < 220) score += 0.2;
      score += Math.min(0.15, overlapRatio(captionBox, figBox) * 0.15);
      if (!best || score > best.score) best = { node: figure, score };
    }
    if (best) {
      used.add(best.node.id);
      relations.push({
        kind: "CAPTION_OF",
        from: caption.id,
        to: best.node.id,
        score: Math.min(0.95, best.score),
      });
    }
  }
  return relations;
}

export function readsBeforeRelations(orderedIds: string[]): CanonicalRelation[] {
  const relations: CanonicalRelation[] = [];
  for (let i = 0; i < orderedIds.length - 1; i++) {
    relations.push({
      kind: "READS_BEFORE",
      from: orderedIds[i],
      to: orderedIds[i + 1],
      score: 0.9,
    });
  }
  return relations;
}

export function topologicalOrder(
  ids: string[],
  relations: CanonicalRelation[]
): string[] | null {
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const id of ids) {
    incoming.set(id, 0);
    outgoing.set(id, []);
  }
  for (const rel of relations) {
    if (rel.kind !== "READS_BEFORE") continue;
    if (!incoming.has(rel.from) || !incoming.has(rel.to)) continue;
    outgoing.get(rel.from)?.push(rel.to);
    incoming.set(rel.to, (incoming.get(rel.to) ?? 0) + 1);
  }
  const queue = ids.filter((id) => (incoming.get(id) ?? 0) === 0);
  const ordered: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const n = (incoming.get(next) ?? 1) - 1;
      incoming.set(next, n);
      if (n === 0) queue.push(next);
    }
  }
  if (ordered.length !== ids.length) return null;
  return ordered;
}

export function figureNodesForCaptions(candidates: RoleCandidate[]): CanonicalNode[] {
  return candidates
    .filter(
      (c) =>
        c.layoutBlock.role === "figure_caption" ||
        c.layoutBlock.role === "table_caption"
    )
    .map((caption, i) => {
      const role = caption.layoutBlock.role === "table_caption" ? "table" : "figure";
      const box = caption.boundingBoxes[0];
      const figureBox = box
        ? {
            ...box,
            y: Math.max(0, box.y - Math.min(180, Math.max(36, box.height * 8))),
            height: Math.min(180, Math.max(36, box.height * 8)),
          }
        : caption.layoutBlock.bbox;
      return {
        id: `fig-${i}`,
        role: role as "figure" | "table",
        text: null,
        pageStart: caption.pageStart,
        pageEnd: caption.pageEnd,
        boundingBoxes: [figureBox],
        confidence: 0.7,
        evidence: [
          {
            source: "generic-heuristic" as const,
            label: role,
            confidence: 0.7,
            page: caption.pageStart,
            reason: "region above caption (pdffigures2-style adjacent proposal)",
          },
        ],
        sourceAnchor: {
          page: caption.pageStart,
          boundingBoxes: [figureBox],
        },
        column: caption.column,
      };
    });
}
