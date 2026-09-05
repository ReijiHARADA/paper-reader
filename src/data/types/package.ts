import type { StructureFile } from "./structure";
import type { LayoutFile } from "./layout";
import type { TranslationFile } from "./translation";

export type PaperJsonAuthor = {
  id: string;
  name: string;
  affiliationIds: string[];
};

export type PaperJsonAffiliation = {
  id: string;
  name: string;
};

export type PaperJson = {
  schemaVersion: number;
  paperId: string;
  revision: number;
  title: {
    original: string | null;
    translated: string | null;
  };
  authors: PaperJsonAuthor[];
  affiliations: PaperJsonAffiliation[];
  publication: string | null;
  year: number | null;
  doi: string | null;
  pageCount: number;
  sourceFileHash: string;
  sourceFileName?: string;
  createdAt: string;
  updatedAt: string;
};

export type PaperAsset = {
  path: string;
  bytes: Uint8Array;
  mimeType?: string;
};

export type PaperPackage = {
  paper: PaperJson;
  originalMarkdown: string;
  translatedMarkdown: string;
  structure: StructureFile;
  translation?: TranslationFile;
  layout?: LayoutFile;
  assets: PaperAsset[];
  sourcePdf?: Uint8Array;
};

export type PackageDiagnostic = {
  level: "error" | "warning";
  code: string;
  message: string;
};

export type PackageValidation = {
  ok: boolean;
  diagnostics: PackageDiagnostic[];
};
