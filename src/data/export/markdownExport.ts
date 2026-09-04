import { parsePaperMarkdown } from "../markdown/parse";
import { serializePaperMarkdown } from "../markdown/serialize";
import { loadPaperPackage } from "../package/persist";
import type { FileSystem } from "../fs/types";
import type { Annotation } from "../../types/annotation";
import type { DocumentNode } from "../types/document";
import type { StructureFile } from "../types/structure";

export type MarkdownExportVariant = "clean" | "verification";

export type MarkdownExportOptions = {
  language?: "ja" | "en";
  stripBlockIds?: boolean;
  variant?: MarkdownExportVariant;
  includeFailedTranslations?: boolean;
  includeAnnotations?: boolean;
  annotations?: Annotation[];
};

export type MarkdownExportResult = {
  fileName: string;
  markdown: string;
  assets: Array<{ path: string; bytes: Uint8Array }>;
};

export type VerificationExportResult = MarkdownExportResult & {
  folderName: string;
  sourcePdf: Uint8Array | null;
};

function slugTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "paper"
  );
}

function packageTitle(
  language: "ja" | "en",
  paper: { title: { original: string | null; translated: string | null } },
  paperId: string
): string {
  return language === "ja"
    ? paper.title.translated || paper.title.original || paperId
    : paper.title.original || paper.title.translated || paperId;
}

function blockComment(id: string, page?: number, status?: string): string {
  const attrs = [`id="${id}"`];
  if (page != null) attrs.push(`page="${page}"`);
  if (status) attrs.push(`status="${status}"`);
  return `<!-- pr:block ${attrs.join(" ")} -->`;
}

function failedCallout(page: number | undefined, original: string): string {
  const pageLine = page != null ? `> Page ${page}\n>\n` : "";
  const originalLines = (original || "").split("\n").map((line) => `> ${line}`);
  return `> [!WARNING] 翻訳失敗\n${pageLine}> Original:\n${originalLines.join("\n")}`;
}

function serializeNodeBody(node: DocumentNode): string {
  return serializePaperMarkdown([{ ...node, id: "" }], {
    paperId: "",
    language: "ja",
    schemaVersion: 1,
  }, { includeBlockComments: false })
    .replace(/^---[\s\S]*?---\n*/, "")
    .trim();
}

export function applyFailedTranslationPolicy(
  nodes: DocumentNode[],
  originals: Map<string, DocumentNode>,
  structure: StructureFile,
  options: { includeFailed: boolean; includeComments: boolean }
): string {
  const parts: string[] = [];
  for (const node of nodes) {
    const status = node.id ? structure.blocks[node.id]?.translationStatus : undefined;
    const page = node.id ? structure.blocks[node.id]?.pageStart : undefined;
    if (status === "failed") {
      if (!options.includeFailed) continue;
      const original = node.id ? originals.get(node.id)?.text ?? "" : "";
      if (options.includeComments && node.id) {
        parts.push(blockComment(node.id, page, "failed"));
      }
      parts.push(failedCallout(page, original));
      parts.push("");
      continue;
    }
    const body = serializeNodeBody(node);
    if (body) parts.push(body);
    if (options.includeComments && node.id) {
      parts.push(blockComment(node.id, page, status));
    }
    parts.push("");
  }
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function appendNotes(markdown: string, options: MarkdownExportOptions): string {
  if (!options.includeAnnotations || !options.annotations?.length) return markdown;
  let next = markdown + `\n\n## Notes\n\n`;
  for (const annotation of options.annotations) {
    next += `> [!NOTE]\n> ${annotation.note || annotation.selectedText}\n\n`;
  }
  return next;
}

export async function exportPaperMarkdown(
  fs: FileSystem,
  paperId: string,
  options: MarkdownExportOptions = {}
): Promise<MarkdownExportResult> {
  const pkg = await loadPaperPackage(fs, paperId);
  const language = options.language ?? "ja";
  const includeFailed = options.includeFailedTranslations === true;
  const includeComments =
    options.variant === "verification" || options.stripBlockIds === false;
  const source = language === "en" ? pkg.originalMarkdown : pkg.translatedMarkdown;
  const parsed = parsePaperMarkdown(source, paperId);
  const originals = new Map(
    parsePaperMarkdown(pkg.originalMarkdown, paperId).nodes
      .filter((node) => node.id)
      .map((node) => [node.id, node])
  );
  const body = applyFailedTranslationPolicy(parsed.nodes, originals, pkg.structure, {
    includeFailed,
    includeComments,
  });
  const front = serializePaperMarkdown([], parsed.frontMatter, { includeBlockComments: false });
  const markdown = appendNotes(`${front}${body}`, options);
  return {
    fileName: slugTitle(packageTitle(language, pkg.paper, paperId)),
    markdown,
    assets: pkg.assets,
  };
}

export async function exportVerificationBundle(
  fs: FileSystem,
  paperId: string,
  options: MarkdownExportOptions = {}
): Promise<VerificationExportResult> {
  const pkg = await loadPaperPackage(fs, paperId);
  const markdownResult = await exportPaperMarkdown(fs, paperId, {
    ...options,
    language: "ja",
    variant: "verification",
    stripBlockIds: false,
  });
  return {
    ...markdownResult,
    folderName: markdownResult.fileName,
    sourcePdf: pkg.sourcePdf ?? null,
    assets: pkg.assets,
  };
}
