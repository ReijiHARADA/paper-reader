import type { PaperJsonAffiliation, PaperJsonAuthor } from "../data/types/package";
import type { Paper, ProcessingStatus } from "../types/paper";

export type PaperMetadata = {
  paperId: string;
  titleOriginal: string | null;
  titleTranslated: string | null;
  authors: PaperJsonAuthor[];
  affiliations: PaperJsonAffiliation[];
  publication: string | null;
  year: number | null;
  doi: string | null;
  pageCount: number;
  sourceFileHash: string;
  sourceFileName?: string;
};

export type LibraryPaperState = {
  paperId: string;
  favorite: boolean;
  lastOpenedAt?: string;
  packageRevision: number;
};

export type ReadingPosition = {
  paperId: string;
  blockId: string;
  offset: number;
};

export type ProcessingState = {
  paperId: string;
  status: ProcessingStatus;
};

export type PaperListItem = {
  paperId: string;
  title: string;
  authors: string[];
  readinessLabel: string;
  readingProgress: number | null;
};

export function authorDisplayNames(authors: PaperJsonAuthor[] | string[]): string[] {
  if (authors.length === 0) return [];
  if (typeof authors[0] === "string") return authors as string[];
  return (authors as PaperJsonAuthor[]).map((author) => author.name);
}

export function paperMetadataFromPaper(paper: Paper): PaperMetadata {
  return {
    paperId: paper.id,
    titleOriginal: paper.titleOriginal,
    titleTranslated: paper.titleTranslated,
    authors: paper.authorsStructured ?? paper.authors.map((name, index) => ({
      id: `author-${index + 1}`,
      name,
      affiliationIds: [],
    })),
    affiliations: paper.affiliations ?? [],
    publication: paper.publication,
    year: paper.year,
    doi: paper.doi ?? null,
    pageCount: paper.pageCount,
    sourceFileHash: paper.sourceFileHash,
    sourceFileName: paper.sourceFileName,
  };
}
