import { parsePaperMarkdown } from "../markdown/parse";
import type { PackageDiagnostic, PackageValidation, PaperPackage } from "../types/package";

function add(
  diagnostics: PackageDiagnostic[],
  level: PackageDiagnostic["level"],
  code: string,
  message: string
): void {
  diagnostics.push({ level, code, message });
}

function sectionHasCycle(
  sections: Array<{ id: string; parentSectionId: string | null }>
): boolean {
  const parent = new Map(sections.map((section) => [section.id, section.parentSectionId]));
  for (const section of sections) {
    const seen = new Set<string>();
    let current: string | null = section.id;
    while (current) {
      if (seen.has(current)) return true;
      seen.add(current);
      current = parent.get(current) ?? null;
    }
  }
  return false;
}

export function validatePaperPackage(pkg: PaperPackage): PackageValidation {
  const diagnostics: PackageDiagnostic[] = [];
  if (pkg.paper.schemaVersion < 1) {
    add(diagnostics, "error", "unsupported-schema", `未対応の paper.json schemaVersion: ${pkg.paper.schemaVersion}`);
  }
  const original = parsePaperMarkdown(pkg.originalMarkdown, pkg.paper.paperId);
  const translated = parsePaperMarkdown(pkg.translatedMarkdown, pkg.paper.paperId);
  if (original.frontMatter && original.frontMatter.paperId !== pkg.paper.paperId) {
    add(diagnostics, "error", "paper-id-mismatch", "original.md の paperId が paper.json と一致しません");
  }
  if (translated.frontMatter && translated.frontMatter.paperId !== pkg.paper.paperId) {
    add(diagnostics, "error", "paper-id-mismatch", "ja.md の paperId が paper.json と一致しません");
  }

  const originalIds = original.nodes.map((n) => n.id).filter(Boolean);
  const translatedIds = translated.nodes.map((n) => n.id).filter(Boolean);
  const originalSet = new Set(originalIds);
  const translatedSet = new Set(translatedIds);
  const structureIds = new Set(Object.keys(pkg.structure.blocks));

  const seenOriginal = new Set<string>();
  for (const id of originalIds) {
    if (seenOriginal.has(id)) {
      add(diagnostics, "error", "duplicate-block-id", `original.md で block ID が重複しています: ${id}`);
    }
    seenOriginal.add(id);
  }
  const seenTranslated = new Set<string>();
  for (const id of translatedIds) {
    if (seenTranslated.has(id)) {
      add(diagnostics, "error", "duplicate-block-id", `ja.md で block ID が重複しています: ${id}`);
    }
    seenTranslated.add(id);
  }

  const sections = pkg.structure.sections ?? [];
  const sectionIds = new Set(sections.map((section) => section.id));
  for (const section of sections) {
    if (section.parentSectionId && !sectionIds.has(section.parentSectionId)) {
      add(diagnostics, "error", "missing-section-parent", `存在しない親セクション: ${section.parentSectionId}`);
    }
  }
  if (sectionHasCycle(sections)) {
    add(diagnostics, "error", "section-cycle", "セクションの親子関係に循環があります");
  }
  const skipStructure = (id: string) =>
    id === "title" || id.endsWith("-caption") || sectionIds.has(id);

  for (const id of originalSet) {
    if (!structureIds.has(id) && !skipStructure(id)) {
      add(diagnostics, "error", "missing-structure", `structure.json に無い block ID: ${id}`);
    }
    if (!translatedSet.has(id) && id !== "title") {
      add(diagnostics, "warning", "alignment-gap", `ja.md に無い block ID: ${id}`);
    }
  }
  for (const id of structureIds) {
    if (!originalSet.has(id) && !id.endsWith("-caption")) {
      add(diagnostics, "error", "orphan-structure", `Markdown に無い structure block: ${id}`);
    }
  }

  const assetPaths = new Set(pkg.assets.map((asset) => asset.path.replace(/^\.\//, "")));
  for (const node of original.nodes) {
    if ((node.type === "figure" || node.type === "table") && node.src?.startsWith("assets/")) {
      if (!assetPaths.has(node.src)) {
        add(diagnostics, "error", "missing-asset", `assets がありません: ${node.src}`);
      }
    }
  }

  for (const [blockId, block] of Object.entries(pkg.structure.blocks)) {
    if (block.pageStart < 1 || block.pageEnd < 1) {
      add(diagnostics, "error", "invalid-page", `page が 1 未満です: ${blockId}`);
    }
    if (block.pageStart > block.pageEnd) {
      add(diagnostics, "error", "invalid-page-range", `pageStart > pageEnd: ${blockId}`);
    }
    for (const box of block.boundingBoxes ?? []) {
      if (![box.x, box.y, box.width, box.height, box.page].every(Number.isFinite)) {
        add(diagnostics, "error", "invalid-bbox", `bbox が有限値ではありません: ${blockId}`);
      }
    }
  }

  for (const relation of pkg.structure.relations) {
    const known = structureIds.has(relation.from) || sectionIds.has(relation.from);
    const knownTo = structureIds.has(relation.to) || sectionIds.has(relation.to);
    if (!known || !knownTo) {
      add(diagnostics, "warning", "missing-relation-endpoint", `relation の端点がありません: ${relation.type}`);
    }
  }

  const references = pkg.structure.references ?? {};
  for (const ref of Object.values(references)) {
    if (ref.blockId && !structureIds.has(ref.blockId)) {
      add(diagnostics, "warning", "missing-reference-block", `reference.blockId がありません: ${ref.id}`);
    }
  }
  if (pkg.sourcePdf && !pkg.paper.sourceFileHash) {
    add(diagnostics, "warning", "missing-source-hash", "source.pdf があるのに sourceFileHash が空です");
  }
  for (const node of original.nodes) {
    const matches = node.text.matchAll(/\[[^\]]+\]\(#([^)]+)\)/g);
    for (const match of matches) {
      const target = match[1];
      if (target.startsWith("ref-") && !references[target]) {
        add(diagnostics, "warning", "broken-reference", `存在しない reference: ${target}`);
      }
    }
  }

  return {
    ok: diagnostics.every((item) => item.level !== "error"),
    diagnostics,
  };
}
