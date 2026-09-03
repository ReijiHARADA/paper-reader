import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Paper, Section, PaperBlock } from "../types/paper";

export type Theme = "light" | "dark" | "system";

export type DisplaySettings = {
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  theme: Theme;
};

type AppState = {
  papers: Paper[];
  currentPaperId: string | null;
  displaySettings: DisplaySettings;
  expandedOriginalBlocks: Set<string>;

  setCurrentPaper: (paperId: string | null) => void;
  addPaper: (paper: Paper) => void;
  updatePaper: (paperId: string, updates: Partial<Paper>) => void;
  removePaper: (paperId: string) => void;

  setDisplaySettings: (settings: Partial<DisplaySettings>) => void;

  toggleOriginalExpanded: (blockId: string) => void;
  setOriginalExpanded: (blockId: string, expanded: boolean) => void;
  clearExpandedOriginals: () => void;
};

const defaultDisplaySettings: DisplaySettings = {
  fontSize: 16,
  lineHeight: 1.8,
  contentWidth: 720,
  theme: "system",
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      papers: [],
      currentPaperId: null,
      displaySettings: defaultDisplaySettings,
      expandedOriginalBlocks: new Set<string>(),

      setCurrentPaper: (paperId) => set({ currentPaperId: paperId }),

      addPaper: (paper) =>
        set((state) => {
          const exists = state.papers.some((p) => p.id === paper.id);
          if (exists) {
            return {
              papers: state.papers.map((p) => (p.id === paper.id ? paper : p)),
            };
          }
          return { papers: [...state.papers, paper] };
        }),

      updatePaper: (paperId, updates) =>
        set((state) => ({
          papers: state.papers.map((p) =>
            p.id === paperId ? { ...p, ...updates } : p
          ),
        })),

      removePaper: (paperId) =>
        set((state) => ({
          papers: state.papers.filter((p) => p.id !== paperId),
          currentPaperId:
            state.currentPaperId === paperId ? null : state.currentPaperId,
        })),

      setDisplaySettings: (settings) =>
        set((state) => ({
          displaySettings: { ...state.displaySettings, ...settings },
        })),

      toggleOriginalExpanded: (blockId) =>
        set((state) => {
          const newSet = new Set(state.expandedOriginalBlocks);
          if (newSet.has(blockId)) {
            newSet.delete(blockId);
          } else {
            newSet.add(blockId);
          }
          return { expandedOriginalBlocks: newSet };
        }),

      setOriginalExpanded: (blockId, expanded) =>
        set((state) => {
          const newSet = new Set(state.expandedOriginalBlocks);
          if (expanded) {
            newSet.add(blockId);
          } else {
            newSet.delete(blockId);
          }
          return { expandedOriginalBlocks: newSet };
        }),

      clearExpandedOriginals: () =>
        set({ expandedOriginalBlocks: new Set<string>() }),
    }),
    {
      name: "paper-reader-storage",
      partialize: (state) => ({
        papers: state.papers,
        displaySettings: state.displaySettings,
      }),
    }
  )
);

type PaperDataState = {
  sections: Record<string, Section[]>;
  blocks: Record<string, PaperBlock[]>;

  setSections: (paperId: string, sections: Section[] | ((prev: Section[]) => Section[])) => void;
  setBlocks: (paperId: string, blocks: PaperBlock[] | ((prev: PaperBlock[]) => PaperBlock[])) => void;
  updateBlock: (paperId: string, blockId: string, updates: Partial<PaperBlock>) => void;
  getSections: (paperId: string) => Section[];
  getBlocks: (paperId: string) => PaperBlock[];
};

export const usePaperDataStore = create<PaperDataState>()((set, get) => ({
  sections: {},
  blocks: {},

  setSections: (paperId, sections) =>
    set((state) => ({
      sections: {
        ...state.sections,
        [paperId]: typeof sections === "function" ? sections(state.sections[paperId] || []) : sections,
      },
    })),

  setBlocks: (paperId, blocks) =>
    set((state) => ({
      blocks: {
        ...state.blocks,
        [paperId]: typeof blocks === "function" ? blocks(state.blocks[paperId] || []) : blocks,
      },
    })),

  updateBlock: (paperId, blockId, updates) =>
    set((state) => {
      const list = state.blocks[paperId] || [];
      const exists = list.some((b) => b.id === blockId);
      const next = exists
        ? list.map((b) => (b.id === blockId ? { ...b, ...updates } : b))
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

  getSections: (paperId) => get().sections[paperId] || [],
  getBlocks: (paperId) => get().blocks[paperId] || [],
}));
