import { MARKDOWN_SCHEMA_VERSION } from "../schemaVersion";
import type { DocumentNode, DocumentNodeType, ParsedMarkdown } from "../types/document";
import { parseFrontMatter } from "./frontMatter";

const BLOCK_COMMENT = /<!--\s*pr:block\s+id="([^"]+)"\s*-->/;
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)]+)\)$/;
const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const CALLOUT_RE = /^>\s*\[!(NOTE|WARNING|TIP|CAUTION)\]\s*$/i;
const ANCHOR_RE = /<a\s+id="([^"]+)"\s*><\/a>/i;
const MATH_FENCE = /^\$\$\s*$/;

function headingType(level: number): DocumentNodeType {
  return level === 1 ? "title" : "heading";
}

function flushParagraph(buffer: string[]): string | null {
  const text = buffer.join("\n").trim();
  buffer.length = 0;
  return text || null;
}

function attachId(node: DocumentNode | undefined, id: string): void {
  if (node) node.id = id;
}

export function parsePaperMarkdown(source: string, fallbackPaperId = ""): ParsedMarkdown {
  const { frontMatter, body } = parseFrontMatter(source);
  const nodes: DocumentNode[] = [];
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const paragraph: string[] = [];
  let i = 0;
  let last: DocumentNode | undefined;

  const pushNode = (node: DocumentNode) => {
    const leftover = flushParagraph(paragraph);
    if (leftover) {
      const para: DocumentNode = { id: "", type: "paragraph", text: leftover };
      nodes.push(para);
      last = para;
    }
    nodes.push(node);
    last = node;
  };

  while (i < lines.length) {
    const line = lines[i];
    const comment = line.trim().match(BLOCK_COMMENT);
    if (comment) {
      const leftover = flushParagraph(paragraph);
      if (leftover) {
        const para: DocumentNode = { id: comment[1], type: "paragraph", text: leftover };
        nodes.push(para);
        last = para;
      } else {
        attachId(last, comment[1]);
      }
      i += 1;
      continue;
    }

    if (line.trim() === "") {
      const leftover = flushParagraph(paragraph);
      if (leftover) {
        const para: DocumentNode = { id: "", type: "paragraph", text: leftover };
        nodes.push(para);
        last = para;
      }
      i += 1;
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      pushNode({
        id: "",
        type: headingType(heading[1].length),
        text: heading[2].trim(),
        level: heading[1].length,
      });
      i += 1;
      continue;
    }

    if (line.trim() === "---") {
      pushNode({ id: "", type: "divider", text: "" });
      i += 1;
      continue;
    }

    if (MATH_FENCE.test(line.trim())) {
      const math: string[] = [];
      i += 1;
      while (i < lines.length && !MATH_FENCE.test(lines[i].trim())) {
        math.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      pushNode({ id: "", type: "equation", text: math.join("\n").trim() });
      continue;
    }

    const callout = line.trim().match(CALLOUT_RE);
    if (callout) {
      const bodyLines: string[] = [];
      i += 1;
      while (i < lines.length && lines[i].startsWith(">")) {
        bodyLines.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      pushNode({
        id: "",
        type: "callout",
        text: bodyLines.join("\n").trim(),
        calloutKind: callout[1].toUpperCase() as DocumentNode["calloutKind"],
      });
      continue;
    }

    const image = line.trim().match(IMAGE_RE);
    if (image) {
      const isTable = /table|表/i.test(image[1]) || /table/i.test(image[2]);
      pushNode({
        id: "",
        type: isTable ? "table" : "figure",
        text: image[1],
        alt: image[1],
        src: image[2],
      });
      i += 1;
      continue;
    }

    const italicCaption = line.trim().match(/^\*(.+)\*$/);
    if (italicCaption && last && (last.type === "figure" || last.type === "table")) {
      pushNode({
        id: "",
        type: "caption",
        text: italicCaption[1],
      });
      i += 1;
      continue;
    }

    const anchor = line.trim().match(ANCHOR_RE);
    if (anchor) {
      i += 1;
      while (i < lines.length && lines[i].trim() === "") i += 1;
      const text = i < lines.length ? lines[i] : "";
      if (text) i += 1;
      pushNode({
        id: "",
        type: "reference",
        text,
        referenceId: anchor[1],
      });
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const tableLines = [line];
      i += 1;
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i += 1;
      }
      pushNode({
        id: "",
        type: "table",
        text: tableLines.join("\n"),
      });
      continue;
    }

    paragraph.push(line);
    i += 1;
  }

  const leftover = flushParagraph(paragraph);
  if (leftover) {
    nodes.push({ id: "", type: "paragraph", text: leftover });
  }

  return {
    frontMatter: frontMatter ?? {
      paperId: fallbackPaperId,
      language: "en",
      schemaVersion: MARKDOWN_SCHEMA_VERSION,
    },
    nodes,
  };
}
