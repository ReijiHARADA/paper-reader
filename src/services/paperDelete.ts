import { deletePaper } from "./database";
import { deleteStoredSourcePdf } from "./sourcePdf";
import { translationManager } from "./translation";

/**
 * Delete a paper from IndexedDB and the managed source.pdf copy.
 * File deletion is best-effort so a missing PDF cannot block library cleanup.
 */
export async function deletePaperEverywhere(paperId: string): Promise<void> {
  translationManager.cancel(paperId);
  await deletePaper(paperId);
  try {
    await deleteStoredSourcePdf(paperId);
  } catch (error) {
    console.warn("Failed to delete stored source PDF:", error);
  }
}
