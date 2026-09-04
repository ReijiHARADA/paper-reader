import type { Paper, PaperBlock, Section } from "../../types/paper";
import { MARKDOWN_SCHEMA_VERSION } from "../schemaVersion";
import type { DocumentNode, ParsedMarkdown } from "../types/document";
import type { StructureReference } from "../types/structure";
import { slugReferenceId, uniqueId } from "../package/ids";
import { parsePaperMarkdown } from "./parse";
import { serializePaperMarkdown } from "./serialize";

function assetName(kind: "figure" | "table" | "equation", index: number, mime?: string): string {
  const ext = mime?.includes("jpeg") || mime?.includes("jpg") ? "jpg" : "png";
  return `assets/${kind}-${String(index).padStart(3, "0")}.${ext}`;
}

function isDataUrl(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("data:");
}

export function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mimeType: match[1] };
}

export type AssetWrite = { path: string; bytes: Uint8Array; mimeType: string };

export function blocksToDocument(input: {
  paper: Paper;
  sections: Section[];
  blocks: PaperBlock[];
  language: "en" | "ja";
}): {
  nodes: DocumentNode[];
  assets: AssetWrite[];
  references: Record<string, StructureReference>;
} {
  const nodes: DocumentNode[] = [];
  const assets: AssetWrite[] = [];
  const references: Record<string, StructureReference> = {};
  const usedRef = new Set<string>();
  const sectionById = new Map(input.sections.map((s) => [s.id, s]));
  const emittedSections = new Set<string>();
  const useTranslated = input.language === "ja";
  let figureCount = 0;
  let tableCount = 0;
  let equationCount = 0;

  const titleText = useTranslated
    ? input.paper.titleTranslated || input.paper.titleOriginal || "Untitled"
    : input.paper.titleOriginal || input.paper.titleTranslated || "Untitled";
  if (titleText) {
    nodes.push({
      id: "title",
      type: "title",
      text: titleText,
      level: 1,
    });
  }

  const ordered = [...input.blocks].sort((a, b) => a.order - b.order);
  for (const block of ordered) {
    if (block.sectionId && !emittedSections.has(block.sectionId)) {
      const section = sectionById.get(block.sectionId);
      if (section) {
        emittedSections.add(section.id);
        const headingText = useTranslated
          ? section.translatedTitle || section.originalTitle
          : section.originalTitle;
        nodes.push({
          id: section.id,
          type: "heading",
          text: headingText,
          level: Math.min(section.level + 1, 6),
        });
      }
    }

    const text = useTranslated
      ? block.translated || block.original || ""
      : block.original || block.translated || "";
    const role = String(block.metadata?.role ?? "");
    if (role === "author" || role === "affiliation" || role === "copyright") {
      continue;
    }
    if (block.type === "heading") continue;

    if (block.type === "figure" || block.type === "table") {
      const caption = useTranslated
        ? String(block.metadata.captionTranslated ?? text)
        : String(block.metadata.captionOriginal ?? text);
      const number = String(
        block.metadata.figureNumber ?? block.metadata.tableNumber ?? (block.type === "figure" ? "Figure" : "Table")
      );
      const imageUrl = String(block.metadata.imageUrl ?? "");
      let src = imageUrl;
      if (isDataUrl(imageUrl)) {
        const decoded = decodeDataUrl(imageUrl);
        if (decoded) {
          const kind = block.type === "figure" ? "figure" : "table";
          const index = kind === "figure" ? ++figureCount : ++tableCount;
          src = assetName(kind, index, decoded.mimeType);
          assets.push({ path: src, bytes: decoded.bytes, mimeType: decoded.mimeType });
        }
      } else if (imageUrl.startsWith("assets/")) {
        src = imageUrl;
      }
      nodes.push({
        id: block.id,
        type: block.type,
        text: caption,
        alt: number,
        src: src || undefined,
      });
      if (caption) {
        nodes.push({
          id: `${block.id}-caption`,
          type: "caption",
          text: caption,
        });
      }
      continue;
    }

    if (block.type === "equation") {
      const imageUrl = String(block.metadata.imageUrl ?? "");
      if (isDataUrl(imageUrl)) {
        const decoded = decodeDataUrl(imageUrl);
        if (decoded) {
          const src = assetName("equation", ++equationCount, decoded.mimeType);
          assets.push({ path: src, bytes: decoded.bytes, mimeType: decoded.mimeType });
        }
      }
      nodes.push({
        id: block.id,
        type: "equation",
        text: String(block.metadata.latex ?? text),
      });
      continue;
    }

    if (block.type === "reference") {
      const number = text.match(/^\[?(\d+)\]?/)?.[1] ?? String(nodes.length);
      const referenceId = uniqueId(slugReferenceId(text, number), usedRef);
      references[referenceId] = {
        id: referenceId,
        blockId: block.id,
        number,
        rawText: text,
        doi: typeof block.metadata.doi === "string" ? block.metadata.doi : null,
        url: typeof block.metadata.url === "string" ? block.metadata.url : null,
        arxivId: typeof block.metadata.arxivId === "string" ? block.metadata.arxivId : null,
      };
      nodes.push({
        id: block.id,
        type: "reference",
        text,
        referenceId,
      });
      continue;
    }

    nodes.push({
      id: block.id,
      type: block.type === "footnote" ? "footnote" : "paragraph",
      text,
    });
  }

  return { nodes, assets, references };
}

export function documentToMarkdown(
  paperId: string,
  language: "en" | "ja",
  nodes: DocumentNode[],
  includeBlockComments = true
): string {
  return serializePaperMarkdown(
    nodes,
    { paperId, language, schemaVersion: MARKDOWN_SCHEMA_VERSION },
    { includeBlockComments }
  );
}

export function parseAlignedMarkdown(
  originalMarkdown: string,
  translatedMarkdown: string,
  paperId: string
): { original: ParsedMarkdown; translated: ParsedMarkdown } {
  return {
    original: parsePaperMarkdown(originalMarkdown, paperId),
    translated: parsePaperMarkdown(translatedMarkdown, paperId),
  };
}

export function applyCitationLinks(
  text: string,
  references: Record<string, StructureReference>
): string {
  const byNumber = new Map<string, string[]>();
  for (const ref of Object.values(references)) {
    const list = byNumber.get(ref.number) ?? [];
    list.push(ref.id);
    byNumber.set(ref.number, list);
  }
  return text.replace(/\[(\d+)\](?!\()/g, (match, number: string) => {
    const ids = byNumber.get(number);
    if (!ids || ids.length !== 1) return match;
    return `[${number}](#${ids[0]})`;
  });
}

export function citationTargetFromHref(href: string): string | null {
  if (href.startsWith("#ref-")) return href.slice(1);
  if (href.startsWith("#")) return href.slice(1);
  return null;
}
