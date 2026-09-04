export type HighlightRange = {
  id: string;
  start: number;
  end: number;
  status?: string;
};

export type HighlightSegment = {
  text: string;
  annotationIds: string[];
};

/**
 * Split translated text into React-safe segments.
 * Overlapping ranges share a segment that lists every annotation id.
 */
export function splitHighlightedText(
  text: string,
  ranges: HighlightRange[]
): HighlightSegment[] {
  const active = ranges.filter(
    (r) => r.status !== "orphaned" && r.end > r.start
  );
  if (active.length === 0) {
    return [{ text, annotationIds: [] }];
  }

  const points = new Set<number>([0, text.length]);
  for (const r of active) {
    points.add(Math.max(0, Math.min(text.length, r.start)));
    points.add(Math.max(0, Math.min(text.length, r.end)));
  }
  const sorted = [...points].sort((a, b) => a - b);
  const segments: HighlightSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end <= start) continue;
    const annotationIds = active
      .filter((r) => r.start < end && r.end > start)
      .map((r) => r.id);
    segments.push({
      text: text.slice(start, end),
      annotationIds,
    });
  }
  return segments;
}
