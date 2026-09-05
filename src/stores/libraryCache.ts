import { create } from "zustand";
import type { Paper, PaperBlock, Section } from "../types/paper";

/**
 * In-memory query cache for library / reader views.
 * Paper Package + SQLite remain the source of truth.
 */
type LibraryCacheState = {
  papers: Paper[];
  sections: Record<string, Section[]>;
  blocks: Record<string, PaperBlock[]>;

  addPaper: (paper: Paper) => void;
  setPapers: (papers: Paper[]) => void;
  updatePaper: (paperId: string, updates: Partial<Paper>) => void;
  removePaper: (paperId: string) => void;

  setSections: (paperId: string, sections: Section[] | ((prev: Section[]) => Section[])) => void;
  setBlocks: (paperId: string, blocks: PaperBlock[] | ((prev: PaperBlock[]) => PaperBlock[])) => void;
  updateBlock: (paperId: string, blockId: string, updates: Partial<PaperBlock>) => void;
  removePaperData: (paperId: string) => void;
  getSections: (paperId: string) => Section[];
  getBlocks: (paperId: string) => PaperBlock[];
};

export const useLibraryCache = create<LibraryCacheState>()((set, get) => ({
  papers: [],
  sections: {},
  blocks: {},

  addPaper: (paper) =>
    set((state) => {
      const exists = state.papers.some((item) => item.id === paper.id);
      if (exists) {
        return {
          papers: state.papers.map((item) => (item.id === paper.id ? paper : item)),
        };
      }
      return { papers: [...state.papers, paper] };
    }),

  setPapers: (papers) => set({ papers }),

  updatePaper: (paperId, updates) =>
    set((state) => ({
      papers: state.papers.map((item) =>
        item.id === paperId ? { ...item, ...updates } : item
      ),
    })),

  removePaper: (paperId) =>
    set((state) => {
      const sections = { ...state.sections };
      const blocks = { ...state.blocks };
      delete sections[paperId];
      delete blocks[paperId];
      return {
        papers: state.papers.filter((item) => item.id !== paperId),
        sections,
        blocks,
      };
    }),

  setSections: (paperId, sections) =>
    set((state) => ({
      sections: {
        ...state.sections,
        [paperId]:
          typeof sections === "function"
            ? sections(state.sections[paperId] || [])
            : sections,
      },
    })),

  setBlocks: (paperId, blocks) =>
    set((state) => ({
      blocks: {
        ...state.blocks,
        [paperId]:
          typeof blocks === "function" ? blocks(state.blocks[paperId] || []) : blocks,
      },
    })),

  updateBlock: (paperId, blockId, updates) =>
    set((state) => {
      const list = state.blocks[paperId] || [];
      const exists = list.some((block) => block.id === blockId);
      const next = exists
        ? list.map((block) => (block.id === blockId ? { ...block, ...updates } : block))
        : updates.id
          ? [...list, updates as PaperBlock]
          : list;
      return {
        blocks: {
          ...state.blocks,
          [paperId]: next,
        },
      };
    }),

  removePaperData: (paperId) =>
    set((state) => {
      const sections = { ...state.sections };
      const blocks = { ...state.blocks };
      delete sections[paperId];
      delete blocks[paperId];
      return {
        papers: state.papers.filter((item) => item.id !== paperId),
        sections,
        blocks,
      };
    }),

  getSections: (paperId) => get().sections[paperId] || [],
  getBlocks: (paperId) => get().blocks[paperId] || [],
}));
