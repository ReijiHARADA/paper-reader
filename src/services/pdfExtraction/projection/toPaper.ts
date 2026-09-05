import type {
  Paper,
  Section,
  PaperBlock,
  NormalizedSectionKind,
  FigureMetadata,
  TableMetadata,
  EquationMetadata,
} from "../../../types/paper";
import { fingerprintText, stableBlockId, uniqueId } from "../../../data/package/ids";
import { reconcileBlockIds } from "../../../data/package/reconcile";
import {
  displayHeadingText,
  figureLookupKey,
  type LayoutBlock,
  type PageColumnLayout,
} from "../../pdfLayout";
import {
  pickPaperTitle,
  pickPublication,
  isReferencesHeading,
  shouldTranslateParagraph,
} from "../../translation/quality";
import { scoreLayoutBlock } from "../../extractionConfidence";
import type { CanonicalDocument, CanonicalNode } from "../canonical/types";
import { topologicalOrder } from "../resolver/relationResolver";

function normalizeSection(title: string): NormalizedSectionKind {
  const lower = title.toLowerCase();
  if (/abstract|要旨/i.test(lower)) return "abstract";
  if (/introduction|はじめに|序論|序言|まえがき/i.test(lower)) {
    return "introduction";
  }
  if (
    /related\s*work|background|literature|prior|関連研究|先行研究|背景/i.test(
      lower
    )
  ) {
    return "related_work";
  }
  if (/method|approach|model|architecture|system|design/i.test(lower)) {
    return "method";
  }
  if (/result|experiment|evaluation|finding|分析結果/i.test(lower)) {
    return "results";
  }
  if (/discussion|考察/i.test(lower)) return "discussion";
  if (/conclusion|summary|future|まとめ|結論|おわりに/i.test(lower)) {
    return "conclusion";
  }
  if (/reference|bibliography|参考文献|引用文献/i.test(lower)) {
    return "references";
  }
  if (/acknowledge|謝辞/i.test(lower)) return "other";
  return "other";
}

function expandAuthorLine(text: string): string[] {
  const cleaned = text
    .replace(/[*,†‡§]/g, " ")
    .replace(/(\p{L})\d+/gu, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];

  const cjkTokens = cleaned.match(/[\u3040-\u30ff\u4e00-\u9fff]{1,4}/g) ?? [];
  const latin = cleaned
    .replace(/[\u3040-\u30ff\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const names: string[] = [];
  if (cjkTokens.length >= 2 && cjkTokens.length % 2 === 0) {
    for (let i = 0; i < cjkTokens.length; i += 2) {
      names.push(`${cjkTokens[i]} ${cjkTokens[i + 1]}`);
    }
  } else if (cjkTokens.length > 0 && !latin) {
    names.push(cjkTokens.join(" "));
  }
  if (latin) names.push(latin);
  return names.length > 0 ? names : [cleaned];
}

function detectHeadingLevel(text: string, fontSize: number, baseFontSize: number): number {
  const match = text.match(/^(\d+)(\.(\d+))?(\.(\d+))?/);
  if (match) {
    if (match[5]) return 3;
    if (match[3]) return 2;
    return 1;
  }
  if (fontSize > baseFontSize * 1.3) return 1;
  if (fontSize > baseFontSize * 1.15) return 2;
  return 1;
}

function isReferenceText(text: string, currentKind: NormalizedSectionKind | null): boolean {
  if (currentKind === "references") return true;
  return /^\[\d+\]/.test(text) || /^\d+\.\s+[A-Z][a-z]+,?\s+[A-Z]/.test(text);
}

function layoutForNode(
  node: CanonicalNode,
  blocks: LayoutBlock[]
): LayoutBlock | undefined {
  return blocks.find(
    (b) =>
      b.pageStart === node.pageStart &&
      b.text === node.text &&
      (b.role === node.role ||
        (node.role === "caption" &&
          (b.role === "figure_caption" || b.role === "table_caption")) ||
        (node.role === "abstract" && b.role === "paragraph"))
  );
}

export type PaperProjection = {
  paper: Paper;
  sections: Section[];
  blocks: PaperBlock[];
};

/**
 * CanonicalDocument → Paper / Section / PaperBlock.
 * Import and the reader consume only this projection.
 */
export function projectCanonicalToPaper(input: {
  canonical: CanonicalDocument;
  paperId: string;
  filePath: string;
  fileHash: string;
  metadata: { title?: string; author?: string; pageCount: number };
  layoutBlocks: LayoutBlock[];
  layouts: PageColumnLayout[];
  baseFontSize: number;
  previousBlocks?: PaperBlock[];
}): PaperProjection {
  const { canonical, paperId, layoutBlocks, layouts, baseFontSize } = input;
  const titleNode = canonical.nodes.find((n) => n.role === "title");
  const authorNodes = canonical.nodes.filter((n) => n.role === "author" && n.text && !/@/.test(n.text));
  const affiliationNodes = canonical.nodes.filter((n) => n.role === "affiliation" && n.text);
  const affiliated = canonical.relations.filter((r) => r.kind === "AFFILIATED_WITH");
  const authorsStructured = authorNodes.map((node) => ({
    id: node.id,
    name: (node.text ?? "").trim(),
    affiliationIds: affiliated.filter((rel) => rel.from === node.id).map((rel) => rel.to),
  }));
  const affiliations = affiliationNodes.map((node) => ({
    id: node.id,
    name: (node.text ?? "").trim(),
  }));
  const authorNames = authorsStructured
    .flatMap((author) => expandAuthorLine(author.name))
    .filter(Boolean);
  const doiMatch = canonical.nodes
    .map((node) => node.text ?? "")
    .join("\n")
    .match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i)?.[0];

  const childOf = canonical.relations.filter((r) => r.kind === "CHILD_OF");
  const parentByHeading = new Map<string, string>();
  for (const rel of childOf) {
    parentByHeading.set(rel.from, rel.to);
  }

  const sectionIdByHeading = new Map<string, string>();
  const sections: Section[] = [];
  const blocks: PaperBlock[] = [];
  let currentSectionId: string | null = null;
  let currentKind: NormalizedSectionKind | null = null;
  let blockOrder = 0;
  let sectionOrder = 0;

  const usedIds = new Set<string>();
  const skip = new Set(["header", "footer", "title", "copyright", "author", "affiliation", "figure", "table"]);

  const readable = canonical.nodes.filter((n) => !skip.has(n.role));
  const fallbackIds = readable.map((n) => n.id);
  const orderedIds =
    topologicalOrder(fallbackIds, canonical.relations) ?? fallbackIds;
  const nodeById = new Map(canonical.nodes.map((n) => [n.id, n]));
  const orderedNodes = orderedIds
    .map((id) => nodeById.get(id))
    .filter((n): n is CanonicalNode => Boolean(n));

  const pushBlock = (
    node: CanonicalNode,
    layout: LayoutBlock | undefined,
    partial: Omit<PaperBlock, "id" | "paperId" | "order" | "extractionConfidence">
  ) => {
    const pageLayout = layouts.find((l) => l.page === node.pageStart);
    const scored = layout
      ? scoreLayoutBlock(layout, pageLayout)
      : { score: node.confidence, diagnostics: canonical.diagnostics };
    blocks.push({
      id: uniqueId(
        stableBlockId({
          type: partial.type,
          page: node.pageStart,
          text: node.text ?? "",
          bbox: node.boundingBoxes[0],
        }),
        usedIds
      ),
      paperId,
      order: blockOrder++,
      extractionConfidence: scored.score,
      ...partial,
      metadata: {
        ...partial.metadata,
        extractionDiagnostics: {
          columnConfidence: scored.diagnostics.columnConfidence,
          readingOrderConfidence: scored.diagnostics.readingOrderConfidence,
          unicodeConfidence: scored.diagnostics.unicodeConfidence,
          paragraphConfidence: scored.diagnostics.paragraphConfidence,
          layoutConfidence: canonical.diagnostics.layoutConfidence,
          textIntegrityConfidence: canonical.diagnostics.textIntegrityConfidence,
          semanticConfidence: canonical.diagnostics.semanticConfidence,
          formatConfidence: canonical.diagnostics.formatConfidence,
          relationConfidence: canonical.diagnostics.relationConfidence,
        },
        evidence: node.evidence,
        sourceAnchor: node.sourceAnchor,
        canonicalNodeId: node.id,
      },
    });
  };

  for (const node of orderedNodes) {
    const layout = layoutForNode(node, layoutBlocks);
    const boxes =
      node.boundingBoxes.length > 0
        ? node.boundingBoxes
        : layout
          ? layout.lines.map((line) => line.bbox)
          : [];
    const column = node.column ?? layout?.column ?? "single";

    if (node.role === "heading") {
      const text = node.text ?? "";
      if (currentKind === "references" && !isReferencesHeading(text)) {
        pushBlock(node, layout, {
          sectionId: currentSectionId,
          type: "reference",
          pageStart: node.pageStart,
          pageEnd: node.pageEnd,
          boundingBoxes: boxes,
          original: text,
          translated: null,
          translationStatus: "skipped",
          parentBlockId: null,
          metadata: { column, role: "reference" },
        });
        continue;
      }
      const headingText = displayHeadingText(text);
      const level = detectHeadingLevel(
        headingText,
        layout?.lines[0]?.fontSize ?? baseFontSize,
        baseFontSize
      );
      const sectionId = uniqueId(
        `s-${fingerprintText(`${headingText}|${node.pageStart}|${sectionOrder}`)}`,
        usedIds
      );
      const kind = normalizeSection(headingText);
      const parentHeadingId = parentByHeading.get(node.id);
      const parentSectionId = parentHeadingId
        ? (sectionIdByHeading.get(parentHeadingId) ?? null)
        : null;
      const section: Section = {
        id: sectionId,
        paperId,
        parentSectionId,
        order: sectionOrder++,
        level,
        originalTitle: headingText,
        translatedTitle: null,
        normalizedKind: kind,
      };
      sections.push(section);
      sectionIdByHeading.set(node.id, sectionId);
      currentSectionId = sectionId;
      currentKind = kind;
      pushBlock(node, layout, {
        sectionId,
        type: "heading",
        pageStart: node.pageStart,
        pageEnd: node.pageEnd,
        boundingBoxes: boxes,
        original: text,
        translated: null,
        translationStatus: "skipped",
        parentBlockId: null,
        metadata: { column, role: "heading" },
      });
      continue;
    }

    if (node.role === "caption") {
      const text = node.text ?? "";
      const layoutRole = layout?.role;
      if (layoutRole === "table_caption" || /^(?:table|表)\s/i.test(text)) {
        const match = text.match(/^(table|表)\s*(\S+)/i);
        const tableNumber = match
          ? /表/.test(match[1])
            ? `表 ${match[2]}`
            : `Table ${match[2]}`
          : "Table";
        pushBlock(node, layout, {
          sectionId: currentSectionId,
          type: "table",
          pageStart: node.pageStart,
          pageEnd: node.pageEnd,
          boundingBoxes: boxes,
          original: text,
          translated: null,
          translationStatus: "pending",
          parentBlockId: null,
          metadata: {
            imageUrl: "",
            tableNumber,
            captionOriginal: text,
            captionTranslated: null,
            column,
            figureKey: figureLookupKey(text, node.pageStart),
            captionOf: canonical.relations.find(
              (r) => r.kind === "CAPTION_OF" && r.from === node.id
            )?.to,
          } satisfies TableMetadata & {
            column: string;
            figureKey: string;
            captionOf?: string;
          },
        });
        continue;
      }
      const match = text.match(/^(figure|fig\.?|図)\s*(\d+)/i);
      const figureNumber = match
        ? /図/.test(match[1])
          ? `図 ${match[2]}`
          : `Figure ${match[2]}`
        : "Figure";
      pushBlock(node, layout, {
        sectionId: currentSectionId,
        type: "figure",
        pageStart: node.pageStart,
        pageEnd: node.pageEnd,
        boundingBoxes: boxes,
        original: text,
        translated: null,
        translationStatus: "pending",
        parentBlockId: null,
        metadata: {
          imageUrl: "",
          captionOriginal: text,
          captionTranslated: null,
          figureNumber,
          column,
          figureKey: figureLookupKey(text, node.pageStart),
          captionOf: canonical.relations.find(
            (r) => r.kind === "CAPTION_OF" && r.from === node.id
          )?.to,
        } satisfies FigureMetadata & {
          column: string;
          figureKey: string;
          captionOf?: string;
        },
      });
      continue;
    }

    if (node.role === "equation") {
      const text = node.text ?? "";
      const num = text.match(/\(\s*(\d{1,2}[a-z]?)\s*\)\s*$/);
      pushBlock(node, layout, {
        sectionId: currentSectionId,
        type: "equation",
        pageStart: node.pageStart,
        pageEnd: node.pageEnd,
        boundingBoxes: boxes,
        original: text,
        translated: null,
        translationStatus: "skipped",
        parentBlockId: null,
        metadata: {
          equationNumber: num ? `(${num[1]})` : undefined,
          column,
        } satisfies EquationMetadata & { column: string },
      });
      continue;
    }

    if (node.role === "footnote") {
      const text = node.text ?? "";
      pushBlock(node, layout, {
        sectionId: currentSectionId,
        type: "footnote",
        pageStart: node.pageStart,
        pageEnd: node.pageEnd,
        boundingBoxes: boxes,
        original: text,
        translated: null,
        translationStatus: shouldTranslateParagraph(text) ? "pending" : "skipped",
        parentBlockId: null,
        metadata: { column, role: "footnote" },
      });
      continue;
    }

    if (
      node.role === "paragraph" ||
      node.role === "abstract" ||
      node.role === "reference" ||
      node.role === "other"
    ) {
      const text = node.text ?? "";
      const isRef = node.role === "reference" || isReferenceText(text, currentKind);
      pushBlock(node, layout, {
        sectionId: currentSectionId,
        type: isRef ? "reference" : "paragraph",
        pageStart: node.pageStart,
        pageEnd: node.pageEnd,
        boundingBoxes: boxes,
        original: text,
        translated: null,
        translationStatus:
          isRef || !shouldTranslateParagraph(text) ? "skipped" : "pending",
        parentBlockId: null,
        metadata: { column, role: node.role },
      });
    }
  }

  const paper: Paper = {
    id: paperId,
    sourceFilePath: input.filePath,
    sourceFileName: input.filePath,
    sourceStoredPath: null,
    sourceFileHash: input.fileHash,
    titleOriginal: pickPaperTitle(input.metadata.title, titleNode?.text ?? undefined),
    titleTranslated: null,
    authors:
      authorNames.length > 0
        ? authorNames
        : input.metadata.author
          ? [input.metadata.author]
          : [],
    authorsStructured,
    affiliations,
    doi: doiMatch ?? null,
    publication: pickPublication(input.metadata.title),
    year: null,
    pageCount: input.metadata.pageCount,
    processingStatus: "structuring",
    lastReadBlockId: null,
    lastReadOffset: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const reconciled = input.previousBlocks?.length
    ? reconcileBlockIds(input.previousBlocks, blocks).blocks
    : blocks;

  return { paper, sections, blocks: reconciled };
}

