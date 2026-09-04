/**
 * Utility to clean up duplicate papers in IndexedDB.
 *
 * Usage from browser console:
 *   import('/src/utils/cleanupDuplicates.ts').then(m => m.cleanupDuplicatePapers())
 */

import { getAllPapers, deletePaper } from "../services/database";
import type { Paper } from "../types/paper";

interface DuplicateGroup {
  hash?: string;
  title?: string;
  papers: Array<{
    id: string;
    title: string;
    hash?: string;
    importedAt: string;
  }>;
}

export async function findDuplicates(): Promise<DuplicateGroup[]> {
  const papers = await getAllPapers();

  const byHash = new Map<string, Paper[]>();
  const byTitle = new Map<string, Paper[]>();

  for (const paper of papers) {
    const h = paper.sourceFileHash;
    if (h) {
      const list = byHash.get(h) ?? [];
      list.push(paper);
      byHash.set(h, list);
    }
    const t = (paper.titleOriginal ?? "").toLowerCase().trim();
    if (t) {
      const list = byTitle.get(t) ?? [];
      list.push(paper);
      byTitle.set(t, list);
    }
  }

  const duplicateGroups: DuplicateGroup[] = [];

  for (const [hash, group] of byHash.entries()) {
    if (group.length > 1) {
      duplicateGroups.push({
        hash,
        papers: group
          .map((p) => ({ id: p.id, title: p.titleOriginal ?? p.id, hash: p.sourceFileHash, importedAt: p.createdAt }))
          .sort((a, b) => a.importedAt.localeCompare(b.importedAt)),
      });
    }
  }

  for (const [title, group] of byTitle.entries()) {
    if (group.length > 1) {
      const alreadyCovered = duplicateGroups.some((g) =>
        group.some((p) => g.papers.some((gp) => gp.id === p.id))
      );
      if (!alreadyCovered) {
        duplicateGroups.push({
          title,
          papers: group
            .map((p) => ({ id: p.id, title: p.titleOriginal ?? p.id, hash: p.sourceFileHash, importedAt: p.createdAt }))
            .sort((a, b) => a.importedAt.localeCompare(b.importedAt)),
        });
      }
    }
  }

  return duplicateGroups;
}

export async function cleanupDuplicatePapers(dryRun = true): Promise<{
  totalDuplicateGroups: number;
  totalPapersToDelete: number;
  deletedPapers: Array<{ id: string; title: string; reason: string }>;
}> {
  const duplicateGroups = await findDuplicates();
  const deletedPapers: Array<{ id: string; title: string; reason: string }> = [];

  for (const group of duplicateGroups) {
    const [, ...toDelete] = group.papers;
    for (const paper of toDelete) {
      deletedPapers.push({
        id: paper.id,
        title: paper.title,
        reason: group.hash ? `Duplicate hash: ${group.hash}` : `Duplicate title: ${group.title}`,
      });
      if (!dryRun) {
        await deletePaper(paper.id);
      }
    }
  }

  return {
    totalDuplicateGroups: duplicateGroups.length,
    totalPapersToDelete: deletedPapers.length,
    deletedPapers,
  };
}

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).findDuplicates = findDuplicates;
  (window as unknown as Record<string, unknown>).cleanupDuplicatePapers = cleanupDuplicatePapers;
}
