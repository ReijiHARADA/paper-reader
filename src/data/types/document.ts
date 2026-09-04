export type DocumentNodeType =
  | "title"
  | "heading"
  | "paragraph"
  | "figure"
  | "table"
  | "caption"
  | "equation"
  | "footnote"
  | "reference"
  | "callout"
  | "divider";

export type DocumentInlineLink = {
  text: string;
  href: string;
  kind: "citation" | "external" | "internal";
};

export type DocumentNode = {
  id: string;
  type: DocumentNodeType;
  text: string;
  level?: number;
  alt?: string;
  src?: string;
  language?: string;
  calloutKind?: "NOTE" | "WARNING" | "TIP" | "CAUTION";
  referenceId?: string;
  children?: DocumentNode[];
};

export type MarkdownFrontMatter = {
  paperId: string;
  language: "en" | "ja";
  schemaVersion: number;
};

export type ParsedMarkdown = {
  frontMatter: MarkdownFrontMatter;
  nodes: DocumentNode[];
};
