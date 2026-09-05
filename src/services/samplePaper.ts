import { sampleBlocks, samplePaper, sampleSections } from "../data/samplePaper";
import { getPaper, saveBlocks, savePaper, saveSections } from "./database";
import { useLibraryCache } from "../stores/libraryCache";

export async function addSamplePaper(): Promise<"added" | "exists"> {
  const { papers, addPaper, setSections, setBlocks } = useLibraryCache.getState();

  if (papers.some((paper) => paper.id === samplePaper.id)) {
    return "exists";
  }

  const existing = await getPaper(samplePaper.id);
  if (existing) {
    addPaper(existing);
    setSections(existing.id, sampleSections);
    setBlocks(existing.id, sampleBlocks);
    return "exists";
  }

  const now = new Date().toISOString();
  const paper = { ...samplePaper, createdAt: now, updatedAt: now };
  await savePaper(paper);
  await saveSections(sampleSections);
  await saveBlocks(sampleBlocks);
  addPaper(paper);
  setSections(paper.id, sampleSections);
  setBlocks(paper.id, sampleBlocks);
  return "added";
}
