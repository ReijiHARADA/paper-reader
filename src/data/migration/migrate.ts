import type { FileSystem } from "../fs/types";
import { projectionToPackage } from "../package/fromProjection";
import { loadPaperPackage, persistPaperPackage, paperPackageExists } from "../package/persist";
import { saveAnnotationRow } from "../repositories/annotationRepository";
import { indexPaperText, upsertPaperIndex } from "../repositories/paperRepository";
import {
  createWorkspaceNode,
  addPaperToWorkspace,
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

  try {
    const snapshot = await readLegacyLibrary(idb);
    if (snapshot.papers.length === 0 && snapshot.projects.length === 0) {
      db.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('migration_idb_v4', 'done')");
      return { migrated: false, paperCount: 0 };
    }

    const ftsPayloads: Array<{ paper: (typeof snapshot.papers)[number]; original: string; translated: string }> =
      [];
    let imported = 0;
    for (const paper of snapshot.papers) {
      const sections = snapshot.sections.filter((section) => section.paperId === paper.id);
      const blocks = snapshot.blocks.filter((block) => block.paperId === paper.id);
      const hasPackage = await paperPackageExists(fs, paper.id);
      const hasIndex = Boolean(db.get("SELECT id FROM papers WHERE id = ?", [paper.id]));
      if (!hasPackage) {
        rememberDocument(paper, sections, blocks);
        const pkg = projectionToPackage({ paper, sections, blocks });
        await persistPaperPackage(fs, pkg);
        ftsPayloads.push({
          paper,
          original: pkg.originalMarkdown,
          translated: pkg.translatedMarkdown,
        });
        imported += 1;
      } else if (!hasIndex) {
        try {
          const pkg = await loadPaperPackage(fs, paper.id);
          ftsPayloads.push({
            paper,
            original: pkg.originalMarkdown,
            translated: pkg.translatedMarkdown,
          });
        } catch {
          // Package exists but is unreadable; still upsert the index below.
        }
      }
    }

    db.transaction(() => {
      for (const paper of snapshot.papers) {
        if (!db.get("SELECT id FROM papers WHERE id = ?", [paper.id])) {
          upsertPaperIndex(db, paper);
        }
      }
      for (const payload of ftsPayloads) {
        indexPaperText(db, payload.paper, payload.original, payload.translated);
      }

      for (const project of snapshot.projects) {
        const existing = db.get("SELECT id FROM workspace_nodes WHERE id = ?", [project.id]);
        if (!existing) {
          createWorkspaceNode(db, {
            id: project.id,
            name: project.name,
            parentId: null,
            description: project.description,
            researchQuestion: project.researchQuestion,
            keywords: project.keywords,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
          });
        }
      }

      for (const link of snapshot.projectPapers) {
        const already = db.get(
          "SELECT paper_id FROM workspace_papers WHERE node_id = ? AND paper_id = ?",
          [link.folderId ?? link.projectId, link.paperId]
        );
        if (!already) addPaperToWorkspace(db, { nodeId: link.folderId ?? link.projectId, paperId: link.paperId, note: link.note, relevance: link.relevance, status: link.status, decision: link.decision, tags: link.tags, quotes: link.quotes });
      }

      for (const annotation of snapshot.annotations) {
        if (!db.get("SELECT id FROM annotations WHERE id = ?", [annotation.id])) {
          saveAnnotationRow(db, {
            ...annotation,
            workspaceNodeId: annotation.projectId,
          });
        }
      }

      for (const glossary of snapshot.glossaries) {
        if (!db.get("SELECT paper_id FROM glossaries WHERE paper_id = ?", [glossary.paperId])) {
          saveGlossaryRow(db, glossary.paperId, glossary.entries, glossary.createdAt);
        }
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
        if (!db.get("SELECT id FROM benchmarks WHERE id = ?", [bench.id])) {
          saveBenchmarkRow(db, bench);
        }
      }

      db.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('migration_idb_v4', 'done')");
    });
    await db.persist();
    return { migrated: imported > 0 || snapshot.projects.length > 0, paperCount: snapshot.papers.length };
  } finally {
    idb.close();
  }
}

export async function migratePaperPackageIfPresent(
  fs: FileSystem,
  paperId: string
): Promise<boolean> {
  if (!(await paperPackageExists(fs, paperId))) return false;
  await loadPaperPackage(fs, paperId);
  return true;
}
