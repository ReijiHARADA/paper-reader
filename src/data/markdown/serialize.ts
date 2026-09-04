import { MARKDOWN_SCHEMA_VERSION } from "../schemaVersion";
import type { DocumentNode, MarkdownFrontMatter } from "../types/document";
import { serializeFrontMatter } from "./frontMatter";

function headingPrefix(node: DocumentNode): string {
  const level = Math.min(Math.max(node.level ?? (node.type === "title" ? 1 : 2), 1), 6);
  return "#".repeat(level);
}

function serializeNode(node: DocumentNode): string {
  switch (node.type) {
    case "title":
    case "heading":
      return `${headingPrefix(node)} ${node.text}`;
    case "paragraph":
    case "footnote":
      return node.text;
    case "figure":
      return `![${node.alt || node.text || "Figure"}](${node.src || ""})`;
    case "table":
      if (node.src) {
        return `![${node.alt || node.text || "Table"}](${node.src})`;
      }
      return node.text;
    case "caption":
      return `*${node.text}*`;
    case "equation":
      return `$$\n${node.text}\n$$`;
    case "divider":
      return "---";
    case "callout":
      return `> [!${node.calloutKind ?? "NOTE"}]\n${node.text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}`;
    case "reference": {
      const anchor = node.referenceId ? `<a id="${node.referenceId}"></a>\n\n` : "";
      return `${anchor}${node.text}`;
    }
    default:
      return node.text;
  }
}

export function serializePaperMarkdown(
  nodes: DocumentNode[],
  frontMatter: MarkdownFrontMatter,
  options?: { includeBlockComments?: boolean }
): string {
  const includeComments = options?.includeBlockComments !== false;
  const parts = [serializeFrontMatter({
    ...frontMatter,
    schemaVersion: frontMatter.schemaVersion || MARKDOWN_SCHEMA_VERSION,
  })];

  for (const node of nodes) {
    parts.push(serializeNode(node));
    if (includeComments && node.id) {
      parts.push(`<!-- pr:block id="${node.id}" -->`);
    }
    parts.push("");
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function stripBlockComments(markdown: string): string {
  return markdown.replace(/<!--\s*pr:block\s+id="[^"]+"\s*-->\n?/g, "").replace(/\n{3,}/g, "\n\n");
}
