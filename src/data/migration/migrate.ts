import type { FileSystem } from "../fs/types";
import { projectionToPackage } from "../package/fromProjection";
import { loadPaperPackage, persistPaperPackage, paperPackageExists } from "../package/persist";
import { saveAnnotationRow } from "../repositories/annotationRepository";
import { indexPaperText, upsertPaperIndex } from "../repositories/paperRepository";
import {
  createWorkspaceNode,
  saveProjectPaperRow,
  upsertProjectMeta,
} from "../repositories/workspaceRepository";
import {
  saveBenchmarkRow,
  saveGlossaryRow,
  saveSettingRow,
  saveTranslationCacheRow,
} from "../repositories/settingsRepository";
import { rememberDocument } from "../repositories/documentRepository";
import type { SqliteClient } from "../sqlite/client";
import { openLegacyIdb, readLegacyLibrary } from "./legacyIdb";

export async function migrateIndexedDbV4IfNeeded(
  fs: FileSystem,
  db: SqliteClient
): Promise<{ migrated: boolean; paperCount: number }> {
  const mark = db.get<{ value: string }>("SELECT value FROM meta WHERE key = ?", ["migration_idb_v4"]);
  if (mark?.value === "done") {
    return { migrated: false, paperCount: 0 };
  }

  const idb = await openLegacyIdb();
  if (!idb) {
    db.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('migration_idb_v4', 'done')");
    return { migrated: false, paperCount: 0 };
  }

  const snapshot = await readLegacyLibrary(idb);
  if (snapshot.papers.length === 0 && snapshot.projects.length === 0) {
    db.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('migration_idb_v4', 'done')");
    return { migrated: false, paperCount: 0 };
  }

  const existingPaper = db.get("SELECT id FROM papers LIMIT 1");
  if (existingPaper) {
    db.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('migration_idb_v4', 'done')");
    return { migrated: false, paperCount: 0 };
  }

  for (const paper of snapshot.papers) {
    if (await paperPackageExists(fs, paper.id)) continue;
    const sections = snapshot.sections.filter((section) => section.paperId === paper.id);
    const blocks = snapshot.blocks.filter((block) => block.paperId === paper.id);
    rememberDocument(paper, sections, blocks);
    upsertPaperIndex(db, paper);
    const pkg = projectionToPackage({ paper, sections, blocks });
    await persistPaperPackage(fs, pkg);
    indexPaperText(db, paper, pkg.originalMarkdown, pkg.translatedMarkdown);
  }

  for (const project of snapshot.projects) {
    const existing = db.get("SELECT id FROM workspace_nodes WHERE id = ?", [project.id]);
    if (!existing) {
      createWorkspaceNode(db, {
        id: project.id,
        kind: "project",
        name: project.name,
        parentId: null,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      });
    }
    upsertProjectMeta(db, project);
  }

  for (const link of snapshot.projectPapers) {
    const already = db.get(
      "SELECT paper_id FROM project_papers WHERE project_id = ? AND paper_id = ?",
      [link.projectId, link.paperId]
    );
    if (!already) saveProjectPaperRow(db, link);
  }

  for (const annotation of snapshot.annotations) {
    if (!db.get("SELECT id FROM annotations WHERE id = ?", [annotation.id])) {
      saveAnnotationRow(db, annotation);
    }
  }

  for (const glossary of snapshot.glossaries) {
    saveGlossaryRow(db, glossary.paperId, glossary.entries, glossary.createdAt);
  }

  for (const entry of snapshot.translationCache) {
    saveTranslationCacheRow(db, entry.textHash, {
      model: entry.model,
      modelVersion: entry.modelVersion,
      sourceLanguage: entry.sourceLanguage,
      targetLanguage: entry.targetLanguage,
      translatedText: entry.translatedText,
    });
  }

  for (const setting of snapshot.settings) {
    if (setting && typeof setting === "object" && "key" in setting) {
      const row = setting as { key: string; value?: unknown };
      saveSettingRow(db, row.key, "value" in row ? row.value : setting);
    }
  }

  for (const bench of snapshot.benchmarks) {
    saveBenchmarkRow(db, bench);
  }

  db.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('migration_idb_v4', 'done')");
  await db.persist();
  return { migrated: true, paperCount: snapshot.papers.length };
}

export async function migratePaperPackageIfPresent(
  fs: FileSystem,
  paperId: string
): Promise<boolean> {
  if (!(await paperPackageExists(fs, paperId))) return false;
  await loadPaperPackage(fs, paperId);
  return true;
}
