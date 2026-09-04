import { sampleBlocks, samplePaper, sampleSections } from "../data/samplePaper";
import { getPaper, saveBlocks, savePaper, saveSections } from "./database";
import { useAppStore, usePaperDataStore } from "../stores/appStore";

export async function addSamplePaper(): Promise<"added" | "exists"> {
  const { papers, addPaper } = useAppStore.getState();
  const { setSections, setBlocks } = usePaperDataStore.getState();

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
