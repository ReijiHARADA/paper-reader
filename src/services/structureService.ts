import { v4 as uuidv4 } from "uuid";
import type { ExtractedPage } from "./pdfService";
import type {
  Paper,
  Section,
  PaperBlock,
  NormalizedSectionKind,
  FigureMetadata,
  TableMetadata,
  EquationMetadata,
} from "../types/paper";
import {
  reconstructDocument,
  formatReadingOrderLog,
  figureLookupKey,
  type LayoutBlock,
  type PageColumnLayout,
} from "./pdfLayout";
import { pickPaperTitle, pickPublication, isReferencesHeading, shouldTranslateHeading, shouldTranslateParagraph } from "./translation/quality";
import { scoreLayoutBlock } from "./extractionConfidence";

function normalizeSection(title: string): NormalizedSectionKind {
  const lower = title.toLowerCase();
  if (/abstract/i.test(lower)) return "abstract";
  if (/introduction/i.test(lower)) return "introduction";
  if (/related\s*work|background|literature|prior/i.test(lower)) {
    return "related_work";
  }
  if (/method|approach|model|architecture|system|design/i.test(lower)) {
    return "method";
  }
  if (/result|experiment|evaluation|finding/i.test(lower)) return "results";
  if (/discussion/i.test(lower)) return "discussion";
  if (/conclusion|summary|future/i.test(lower)) return "conclusion";
  if (/reference|bibliography/i.test(lower)) return "references";
  if (/acknowledge/i.test(lower)) return "other";
  return "other";
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

export type StructureResult = {
  paper: Paper;
  sections: Section[];
  blocks: PaperBlock[];
  layoutBlocks: LayoutBlock[];
  layouts: PageColumnLayout[];
};

export function analyzeStructure(
  pages: ExtractedPage[],
  paperId: string,
  filePath: string,
  fileHash: string,
  pdfMetadata: { title?: string; author?: string; pageCount: number }
): StructureResult {
  const { blocks: layoutBlocks, layouts, baseFontSize } =
    reconstructDocument(pages);

  const readingOrderLog = formatReadingOrderLog(layoutBlocks);
  console.info("[reading-order] reconstructed paragraphs\n" + readingOrderLog);

  const titleBlock = layoutBlocks.find((b) => b.role === "title");
  const authorNames = layoutBlocks
    .filter((b) => b.role === "author" && !/@/.test(b.text))
    .map((b) =>
      b.text
        .replace(/(\p{L})\d+/gu, "$1")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);

  const sections: Section[] = [];
  const blocks: PaperBlock[] = [];
  let currentSectionId: string | null = null;
  let currentKind: NormalizedSectionKind | null = null;
  let blockOrder = 0;
  let sectionOrder = 0;

  const pushBlock = (
    layout: LayoutBlock,
    partial: Omit<PaperBlock, "id" | "paperId" | "order" | "extractionConfidence">
  ) => {
    const pageLayout = layouts.find((l) => l.page === layout.pageStart);
    const { score, diagnostics } = scoreLayoutBlock(layout, pageLayout);
    blocks.push({
      id: uuidv4(),
      paperId,
      order: blockOrder++,
      extractionConfidence: score,
      ...partial,
      metadata: {
        ...partial.metadata,
        extractionDiagnostics: diagnostics,
      },
    });
  };

  for (const layout of layoutBlocks) {
    if (layout.role === "header" || layout.role === "footer") continue;
    if (layout.role === "title") continue;
    if (layout.role === "copyright") continue;
    if (layout.role === "author" || layout.role === "affiliation") continue;

    const boxes = layout.lines.map((line) => line.bbox);

    if (layout.role === "heading") {
      if (
        currentKind === "references" &&
        !isReferencesHeading(layout.text)
      ) {
        pushBlock(layout, {
          sectionId: currentSectionId,
          type: "reference",
          pageStart: layout.pageStart,
          pageEnd: layout.pageEnd,
          boundingBoxes: boxes,
          original: layout.text,
          translated: null,
          translationStatus: "skipped",
          parentBlockId: null,
          metadata: { column: layout.column, role: "reference" },
        });
        continue;
      }
      const level = detectHeadingLevel(
        layout.text,
        layout.lines[0]?.fontSize ?? baseFontSize,
        baseFontSize
      );
      const sectionId = uuidv4();
      const kind = normalizeSection(layout.text);
      const section: Section = {
        id: sectionId,
        paperId,
        parentSectionId: null,
        order: sectionOrder++,
        level,
        originalTitle: layout.text,
        translatedTitle: null,
        normalizedKind: kind,
      };
      sections.push(section);
      currentSectionId = sectionId;
      currentKind = kind;
      pushBlock(layout, {
        sectionId,
        type: "heading",
        pageStart: layout.pageStart,
        pageEnd: layout.pageEnd,
        boundingBoxes: boxes,
        original: layout.text,
        translated: null,
        translationStatus:
          kind === "references" || !shouldTranslateHeading(layout.text)
            ? "skipped"
            : "pending",
        parentBlockId: null,
        metadata: { column: layout.column, role: layout.role },
      });
      continue;
    }

    if (layout.role === "figure_caption") {
      const match = layout.text.match(/^(figure|fig\.?)\s*(\d+)/i);
      const figureNumber = match ? `Figure ${match[2]}` : "Figure";
      pushBlock(layout, {
        sectionId: currentSectionId,
        type: "figure",
        pageStart: layout.pageStart,
        pageEnd: layout.pageEnd,
        boundingBoxes: boxes,
        original: layout.text,
        translated: null,
        translationStatus: "pending",
        parentBlockId: null,
        metadata: {
          imageUrl: "",
          captionOriginal: layout.text,
          captionTranslated: null,
          figureNumber,
          column: layout.column,
          figureKey: figureLookupKey(layout.text, layout.pageStart),
        } satisfies FigureMetadata & { column: string; figureKey: string },
      });
      continue;
    }

    if (layout.role === "table_caption") {
      const match = layout.text.match(/^(table)\s*(\S+)/i);
      const tableNumber = match ? `Table ${match[2]}` : "Table";
      pushBlock(layout, {
        sectionId: currentSectionId,
        type: "table",
        pageStart: layout.pageStart,
        pageEnd: layout.pageEnd,
        boundingBoxes: boxes,
        original: layout.text,
        translated: null,
        translationStatus: "pending",
        parentBlockId: null,
        metadata: {
          imageUrl: "",
          tableNumber,
          captionOriginal: layout.text,
          captionTranslated: null,
          column: layout.column,
          figureKey: figureLookupKey(layout.text, layout.pageStart),
        } satisfies TableMetadata & { column: string; figureKey: string },
      });
      continue;
    }

    if (layout.role === "equation") {
      const num = layout.text.match(/\(\s*(\d{1,2}[a-z]?)\s*\)\s*$/);
      pushBlock(layout, {
        sectionId: currentSectionId,
        type: "equation",
        pageStart: layout.pageStart,
        pageEnd: layout.pageEnd,
        boundingBoxes: boxes,
        original: layout.text,
        translated: null,
        translationStatus: "skipped",
        parentBlockId: null,
        metadata: {
          equationNumber: num ? `(${num[1]})` : undefined,
          column: layout.column,
        } satisfies EquationMetadata & { column: string },
      });
      continue;
    }

    if (layout.role === "footnote") {
      pushBlock(layout, {
        sectionId: currentSectionId,
        type: "footnote",
        pageStart: layout.pageStart,
        pageEnd: layout.pageEnd,
        boundingBoxes: boxes,
        original: layout.text,
        translated: null,
        translationStatus: shouldTranslateParagraph(layout.text)
          ? "pending"
          : "skipped",
        parentBlockId: null,
        metadata: { column: layout.column, role: "footnote" },
      });
      continue;
    }

    const isRef = isReferenceText(layout.text, currentKind);
    pushBlock(layout, {
      sectionId: currentSectionId,
      type: isRef ? "reference" : "paragraph",
      pageStart: layout.pageStart,
      pageEnd: layout.pageEnd,
      boundingBoxes: boxes,
      original: layout.text,
      translated: null,
      translationStatus:
        isRef || !shouldTranslateParagraph(layout.text) ? "skipped" : "pending",
      parentBlockId: null,
      metadata: { column: layout.column, role: layout.role },
    });
  }

  const paper: Paper = {
    id: paperId,
    sourceFilePath: filePath,
    sourceFileName: filePath,
    sourceStoredPath: null,
    sourceFileHash: fileHash,
    titleOriginal: pickPaperTitle(pdfMetadata.title, titleBlock?.text),
    titleTranslated: null,
    authors:
      authorNames.length > 0
        ? authorNames
        : pdfMetadata.author
          ? [pdfMetadata.author]
          : [],
    publication: pickPublication(pdfMetadata.title),
    year: null,
    pageCount: pdfMetadata.pageCount,
    processingStatus: "structuring",
    lastReadBlockId: null,
    lastReadOffset: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return { paper, sections, blocks, layoutBlocks, layouts };
}

export { formatReadingOrderLog };
