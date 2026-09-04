export const SEARCH_HIT_ATTR = "data-search-hit";

export function wrapSearchHitIndex(
  current: number,
  count: number,
  delta: number
): number {
  if (count <= 0) return 0;
  return (current + delta + count * 10) % count;
}

export function listSearchHits(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(`[${SEARCH_HIT_ATTR}]`));
}

export function paintCurrentSearchHit(hits: HTMLElement[], index: number): void {
  hits.forEach((el, i) => {
    if (i === index) {
      el.setAttribute("data-search-current", "");
    } else {
      el.removeAttribute("data-search-current");
    }
  });
}

export function scrollToSearchHit(hits: HTMLElement[], index: number): void {
  paintCurrentSearchHit(hits, index);
  hits[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
}
