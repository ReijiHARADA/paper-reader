import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

export type DisplaySettings = {
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  theme: Theme;
};

type AppUiState = {
  currentPaperId: string | null;
  displaySettings: DisplaySettings;
  expandedOriginalBlocks: Set<string>;

  setCurrentPaper: (paperId: string | null) => void;
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

export const useAppStore = create<AppUiState>()(
  persist(
    (set) => ({
      currentPaperId: null,
      displaySettings: defaultDisplaySettings,
      expandedOriginalBlocks: new Set<string>(),

      setCurrentPaper: (paperId) => set({ currentPaperId: paperId }),

      setDisplaySettings: (settings) =>
        set((state) => ({
          displaySettings: { ...state.displaySettings, ...settings },
        })),

      toggleOriginalExpanded: (blockId) =>
        set((state) => {
          const next = new Set(state.expandedOriginalBlocks);
          if (next.has(blockId)) next.delete(blockId);
          else next.add(blockId);
          return { expandedOriginalBlocks: next };
        }),

      setOriginalExpanded: (blockId, expanded) =>
        set((state) => {
          const next = new Set(state.expandedOriginalBlocks);
          if (expanded) next.add(blockId);
          else next.delete(blockId);
          return { expandedOriginalBlocks: next };
        }),

      clearExpandedOriginals: () => set({ expandedOriginalBlocks: new Set<string>() }),
    }),
    {
      name: "paper-reader-storage",
      version: 2,
      migrate: (persisted) => {
        const value = persisted as { displaySettings?: DisplaySettings } | undefined;
        return {
          displaySettings: value?.displaySettings ?? defaultDisplaySettings,
        };
      },
      partialize: (state) => ({
        displaySettings: state.displaySettings,
      }),
    }
  )
);
