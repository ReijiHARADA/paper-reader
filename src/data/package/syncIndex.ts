import type { FileSystem } from "../fs/types";
import { getAllPaperIndexes, indexPaperText, upsertPaperIndex } from "../repositories/paperRepository";
import type { SqliteClient } from "../sqlite/client";
import { loadPaperPackage, paperPackageExists } from "./persist";
import { packageToProjection } from "./toProjection";
import { rememberDocument } from "../repositories/documentRepository";

export async function syncPaperIndexesFromPackages(
  fs: FileSystem,
  db: SqliteClient
): Promise<number> {
  let rebuilt = 0;
  for (const index of getAllPaperIndexes(db)) {
    if (!(await paperPackageExists(fs, index.id))) continue;
    const paperText = await fs.readText(`papers/${index.id}/paper.json`);
    if (!paperText) continue;
    let revision = 0;
    try {
      revision = Number(JSON.parse(paperText).revision ?? 0);
    } catch {
      continue;
    }
    if (revision === (index.packageRevision ?? 0)) continue;
    try {
      const pkg = await loadPaperPackage(fs, index.id);
      const projected = packageToProjection(pkg, index);
      const paper = { ...projected.paper, packageRevision: pkg.paper.revision };
      upsertPaperIndex(db, paper);
      indexPaperText(db, paper, pkg.originalMarkdown, pkg.translatedMarkdown);
      rememberDocument(paper, projected.sections, projected.blocks);
      rebuilt += 1;
    } catch (error) {
      console.warn("Failed to rebuild paper index from package:", index.id, error);
    }
  }
  return rebuilt;
}
