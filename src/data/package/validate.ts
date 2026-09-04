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

export function validatePaperPackage(pkg: PaperPackage): PackageValidation {
  const diagnostics: PackageDiagnostic[] = [];
  const original = parsePaperMarkdown(pkg.originalMarkdown, pkg.paper.paperId);
  const translated = parsePaperMarkdown(pkg.translatedMarkdown, pkg.paper.paperId);

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

  const sectionIds = new Set((pkg.structure.sections ?? []).map((section) => section.id));
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

  const references = pkg.structure.references ?? {};
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
