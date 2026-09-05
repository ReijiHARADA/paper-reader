import type { Paper } from "../types/paper";

export type LibrarySearchQuery = {
  query: string;
};

export type PaperSearchQuery = {
  paperId: string;
  query: string;
};

export function normalizeLibraryQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesLibraryQuery(paper: Paper, query: string): boolean {
  const needle = normalizeLibraryQuery(query);
  if (!needle) return true;
  const haystack = [
    paper.titleOriginal,
    paper.titleTranslated,
    paper.sourceFileName,
    paper.publication,
    paper.authors.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export function filterPapersByLibraryQuery(papers: Paper[], query: string): Paper[] {
  const needle = normalizeLibraryQuery(query);
  if (!needle) return papers;
  return papers.filter((paper) => matchesLibraryQuery(paper, query));
}
