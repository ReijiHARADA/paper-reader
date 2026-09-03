/**
 * Utility to clean up duplicate papers in IndexedDB.
 * 
 * This script identifies and removes duplicate papers based on:
 * - Same file hash (exact duplicates)
 * - Same title (potential duplicates)
 * 
 * Usage: Call from browser console:
 * ```
 * import('/src/utils/cleanupDuplicates.ts').then(m => m.cleanupDuplicatePapers())
 * ```
 */

import { getAllPapers, deletePaper } from '../services/database';

interface DuplicateGroup {
  hash?: string;
  title?: string;
  papers: Array<{
    id: string;
    title: string;
    hash?: string;
    importedAt: Date;
  }>;
}

/**
 * Find duplicate papers grouped by hash and title.
 */
export async function findDuplicates(): Promise<DuplicateGroup[]> {
  const papers = await getAllPapers();
  
  // Group by hash
  const byHash = new Map<string, typeof papers>();
  const byTitle = new Map<string, typeof papers>();
  
  for (const paper of papers) {
    if (paper.fileHash) {
      const existing = byHash.get(paper.fileHash) || [];
      existing.push(paper);
      byHash.set(paper.fileHash, existing);
    }
    
    const normalizedTitle = paper.title.toLowerCase().trim();
    const existing = byTitle.get(normalizedTitle) || [];
    existing.push(paper);
    byTitle.set(normalizedTitle, existing);
  }
  
  // Find groups with duplicates
  const duplicateGroups: DuplicateGroup[] = [];
  
  for (const [hash, papers] of byHash.entries()) {
    if (papers.length > 1) {
      duplicateGroups.push({
        hash,
        papers: papers.map(p => ({
          id: p.id,
          title: p.title,
          hash: p.fileHash,
          importedAt: p.importedAt,
        })).sort((a, b) => a.importedAt.getTime() - b.importedAt.getTime()),
      });
    }
  }
  
  for (const [title, papers] of byTitle.entries()) {
    if (papers.length > 1) {
      // Check if not already in hash duplicates
      const hashDuplicate = duplicateGroups.some(g => 
        papers.some(p => g.papers.some(gp => gp.id === p.id))
      );
      
      if (!hashDuplicate) {
        duplicateGroups.push({
          title,
          papers: papers.map(p => ({
            id: p.id,
            title: p.title,
            hash: p.fileHash,
            importedAt: p.importedAt,
          })).sort((a, b) => a.importedAt.getTime() - b.importedAt.getTime()),
        });
      }
    }
  }
  
  return duplicateGroups;
}

/**
 * Clean up duplicate papers, keeping only the first imported one in each group.
 * 
 * @param dryRun If true, only report what would be deleted without actually deleting
 * @returns Summary of deleted papers
 */
export async function cleanupDuplicatePapers(dryRun: boolean = true): Promise<{
  totalDuplicateGroups: number;
  totalPapersToDelete: number;
  deletedPapers: Array<{ id: string; title: string; reason: string }>;
}> {
  const duplicateGroups = await findDuplicates();
  const deletedPapers: Array<{ id: string; title: string; reason: string }> = [];
  
  console.log(`Found ${duplicateGroups.length} duplicate groups`);
  
  for (const group of duplicateGroups) {
    console.log(`\nDuplicate group (${group.hash ? 'by hash' : 'by title'}):`);
    console.log(`  Reference: ${group.hash || group.title}`);
    
    // Keep the first (oldest) one, delete the rest
    const [keep, ...toDelete] = group.papers;
    
    console.log(`  ✓ Keep: ${keep.id} - ${keep.title} (imported: ${keep.importedAt.toISOString()})`);
    
    for (const paper of toDelete) {
      console.log(`  ✗ Delete: ${paper.id} - ${paper.title} (imported: ${paper.importedAt.toISOString()})`);
      
      deletedPapers.push({
        id: paper.id,
        title: paper.title,
        reason: group.hash ? `Duplicate hash: ${group.hash}` : `Duplicate title: ${group.title}`,
      });
      
      if (!dryRun) {
        await deletePaper(paper.id);
        console.log(`    → Deleted from database`);
      }
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Duplicate groups: ${duplicateGroups.length}`);
  console.log(`Papers to delete: ${deletedPapers.length}`);
  
  if (dryRun) {
    console.log(`\nThis was a DRY RUN. No papers were actually deleted.`);
    console.log(`To actually delete, run: cleanupDuplicatePapers(false)`);
  } else {
    console.log(`\n✓ Cleanup complete!`);
  }
  
  return {
    totalDuplicateGroups: duplicateGroups.length,
    totalPapersToDelete: deletedPapers.length,
    deletedPapers,
  };
}

/**
 * Export functions for browser console usage.
 */
if (typeof window !== 'undefined') {
  (window as any).findDuplicates = findDuplicates;
  (window as any).cleanupDuplicatePapers = cleanupDuplicatePapers;
  console.log('Duplicate cleanup utilities loaded:');
  console.log('  - findDuplicates(): Find all duplicate papers');
  console.log('  - cleanupDuplicatePapers(dryRun?: boolean): Clean up duplicates (default: dry run)');
}
