import { describe, expect, it } from "vitest";
import { applyFailedTranslationPolicy } from "../../data/export/markdownExport";
import { exportPaperMarkdown, exportVerificationBundle } from "../../data/export/markdownExport";
import { createMemoryFileSystem } from "../../data/fs/memoryFs";
import { projectionToPackage } from "../../data/package/fromProjection";
import { persistPaperPackage } from "../../data/package/persist";
import type { DocumentNode } from "../../data/types/document";
import type { StructureFile } from "../../data/types/structure";
import type { Paper, PaperBlock, Section } from "../../types/paper";

const now = "2026-09-05T00:00:00.000Z";

function exportSample() {
  const paper: Paper = {
    id: "export-1",
    sourceFilePath: "a.pdf",
    sourceFileHash: "hash-export",
    titleOriginal: "Export Study",
    titleTranslated: "書き出し研究",
    authors: [],
    publication: null,
    year: 2026,
    pageCount: 2,
    processingStatus: "partial",
    lastReadBlockId: null,
    lastReadOffset: null,
    createdAt: now,
    updatedAt: now,
  };
  const sections: Section[] = [
    {
      id: "s-1",
      paperId: "export-1",
      parentSectionId: null,
      order: 0,
      level: 1,
      originalTitle: "Abstract",
      translatedTitle: "概要",
      normalizedKind: "abstract",
    },
  ];
  const blocks: PaperBlock[] = [
    {
      id: "b-ok",
      paperId: "export-1",
      sectionId: "s-1",
      type: "paragraph",
      order: 0,
      pageStart: 1,
      pageEnd: 1,
      boundingBoxes: [],
      original: "Completed paragraph.",
      translated: "完了した段落。",
      extractionConfidence: 1,
      translationStatus: "completed",
      parentBlockId: null,
      metadata: {},
    },
    {
      id: "b-fail",
      paperId: "export-1",
      sectionId: "s-1",
      type: "paragraph",
      order: 1,
      pageStart: 7,
      pageEnd: 7,
      boundingBoxes: [],
      original: "This failed to translate.",
      translated: null,
      extractionConfidence: 1,
      translationStatus: "failed",
      parentBlockId: null,
      metadata: {},
    },
    {
      id: "b-skip",
      paperId: "export-1",
      sectionId: "s-1",
      type: "paragraph",
      order: 2,
      pageStart: 8,
      pageEnd: 8,
      boundingBoxes: [],
      original: "Skipped bibliography-like text.",
      translated: null,
      extractionConfidence: 1,
      translationStatus: "skipped",
      parentBlockId: null,
      metadata: {},
    },
  ];
  return { paper, sections, blocks };
}

describe("markdown export failed policy", () => {
  it("omits failed blocks unless explicitly included", () => {
    const nodes: DocumentNode[] = [
      { id: "b-ok", type: "paragraph", text: "完了した段落。" },
      { id: "b-fail", type: "paragraph", text: "" },
      { id: "b-skip", type: "paragraph", text: "Skipped bibliography-like text." },
    ];
    const originals = new Map<string, DocumentNode>([
      ["b-ok", { id: "b-ok", type: "paragraph", text: "Completed paragraph." }],
      ["b-fail", { id: "b-fail", type: "paragraph", text: "This failed to translate." }],
      ["b-skip", { id: "b-skip", type: "paragraph", text: "Skipped bibliography-like text." }],
    ]);
    const structure: StructureFile = {
      schemaVersion: 1,
      blocks: {
        "b-ok": {
          type: "paragraph",
          pageStart: 1,
          pageEnd: 1,
          boundingBoxes: [],
          extractionConfidence: 1,
          translationStatus: "completed",
        },
        "b-fail": {
          type: "paragraph",
          pageStart: 7,
          pageEnd: 7,
          boundingBoxes: [],
          extractionConfidence: 1,
          translationStatus: "failed",
        },
        "b-skip": {
          type: "paragraph",
          pageStart: 8,
          pageEnd: 8,
          boundingBoxes: [],
          extractionConfidence: 1,
          translationStatus: "skipped",
        },
      },
      relations: [],
      sections: [],
    };

    const off = applyFailedTranslationPolicy(nodes, originals, structure, {
      includeFailed: false,
      includeComments: false,
    });
    expect(off).toContain("完了した段落。");
    expect(off).toContain("Skipped bibliography-like text.");
    expect(off).not.toContain("翻訳失敗");
    expect(off).not.toContain("This failed to translate.");

    const on = applyFailedTranslationPolicy(nodes, originals, structure, {
      includeFailed: true,
      includeComments: true,
    });
    expect(on).toContain('status="failed"');
    expect(on).toContain("page=\"7\"");
    expect(on).toContain("[!WARNING] 翻訳失敗");
    expect(on).toContain("This failed to translate.");
    expect(on).not.toMatch(/status="skipped"[\s\S]*翻訳失敗/);
  });

  it("writes verification bundle files from the package", async () => {
    const fs = createMemoryFileSystem();
    const { paper, sections, blocks } = exportSample();
    const pkg = projectionToPackage({
      paper,
      sections,
      blocks,
      sourcePdf: new Uint8Array([10, 20]),
    });
    await persistPaperPackage(fs, pkg);

    const clean = await exportPaperMarkdown(fs, paper.id, {
      includeFailedTranslations: false,
      variant: "clean",
    });
    expect(clean.markdown).toContain("完了した段落。");
    expect(clean.markdown).not.toContain("翻訳失敗");
    expect(clean.markdown).not.toContain("<!-- pr:block");

    const withFailed = await exportPaperMarkdown(fs, paper.id, {
      includeFailedTranslations: true,
      variant: "verification",
    });
    expect(withFailed.markdown).toContain("翻訳失敗");
    expect(withFailed.markdown).toContain("<!-- pr:block");

    const bundle = await exportVerificationBundle(fs, paper.id, {
      includeFailedTranslations: true,
    });
    expect(bundle.sourcePdf).toEqual(new Uint8Array([10, 20]));
    expect(bundle.markdown).toContain("完了した段落。");
    expect(bundle.folderName).toBeTruthy();
  });
});
