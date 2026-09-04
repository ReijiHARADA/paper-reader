import { MARKDOWN_SCHEMA_VERSION } from "../schemaVersion";
import type { MarkdownFrontMatter } from "../types/document";

export function parseFrontMatter(source: string): {
  frontMatter: MarkdownFrontMatter | null;
  body: string;
} {
  if (!source.startsWith("---")) {
    return { frontMatter: null, body: source };
  }
  const end = source.indexOf("\n---", 3);
  if (end === -1) return { frontMatter: null, body: source };
  const raw = source.slice(4, end);
  const body = source.slice(end + 4).replace(/^\n/, "");
  const fields: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    fields[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  if (!fields.paperId) return { frontMatter: null, body: source };
  return {
    frontMatter: {
      paperId: fields.paperId,
      language: fields.language === "ja" ? "ja" : "en",
      schemaVersion: Number(fields.schemaVersion || MARKDOWN_SCHEMA_VERSION),
    },
    body,
  };
}

export function serializeFrontMatter(frontMatter: MarkdownFrontMatter): string {
  return [
    "---",
    `paperId: "${frontMatter.paperId}"`,
    `language: "${frontMatter.language}"`,
    `schemaVersion: ${frontMatter.schemaVersion}`,
    "---",
    "",
  ].join("\n");
}
