import { parsePaperMarkdown } from "../markdown/parse";
import { serializePaperMarkdown, stripBlockComments } from "../markdown/serialize";
import { loadPaperPackage } from "../package/persist";
import type { FileSystem } from "../fs/types";
import type { Annotation } from "../../types/annotation";

export type MarkdownExportOptions = {
  language?: "ja" | "en";
  stripBlockIds?: boolean;
  includeAnnotations?: boolean;
  annotations?: Annotation[];
};

export type MarkdownExportResult = {
  fileName: string;
  markdown: string;
  assets: Array<{ path: string; bytes: Uint8Array }>;
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

export async function exportPaperMarkdown(
  fs: FileSystem,
  paperId: string,
  options: MarkdownExportOptions = {}
): Promise<MarkdownExportResult> {
  const pkg = await loadPaperPackage(fs, paperId);
  const language = options.language ?? "ja";
  const source = language === "en" ? pkg.originalMarkdown : pkg.translatedMarkdown;
  const parsed = parsePaperMarkdown(source, paperId);
  let markdown = serializePaperMarkdown(parsed.nodes, parsed.frontMatter, {
    includeBlockComments: options.stripBlockIds === false,
  });
  if (options.stripBlockIds !== false) {
    markdown = stripBlockComments(markdown);
  }
  if (options.includeAnnotations && options.annotations?.length) {
    markdown += `\n\n## Notes\n\n`;
    for (const annotation of options.annotations) {
      markdown += `> [!NOTE]\n> ${annotation.note || annotation.selectedText}\n\n`;
    }
  }
  const title =
    language === "ja"
      ? pkg.paper.title.translated || pkg.paper.title.original || paperId
      : pkg.paper.title.original || pkg.paper.title.translated || paperId;
  return {
    fileName: slugTitle(title),
    markdown,
    assets: pkg.assets,
  };
}
