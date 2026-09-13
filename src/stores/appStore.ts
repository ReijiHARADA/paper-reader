import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";
export type OriginalDisplayMode = "on-demand" | "always" | "when-untranslated";
/** auto: hoverで開閉 / expanded: 常時展開 / collapsed: 常時アイコンのみ */
export type SidebarMode = "auto" | "expanded" | "collapsed";

export type DisplaySettings = {
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  theme: Theme;
  originalDisplay: OriginalDisplayMode;
  sidebarMode: SidebarMode;
  /**
   * true (default): icon-rail ではワークスペースの最上位だけ表示し、入れ子は隠す。
   * false: 以前どおり、フォルダが開いていれば折りたたみ中も入れ子アイコンを並べる。
   */
  sidebarCollapseRootsOnly: boolean;
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
  originalDisplay: "on-demand",
  sidebarMode: "auto",
  sidebarCollapseRootsOnly: true,
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
      version: 4,
      migrate: (persisted) => {
        const value = persisted as { displaySettings?: Partial<DisplaySettings> } | undefined;
        return {
          displaySettings: { ...defaultDisplaySettings, ...value?.displaySettings },
        };
      },
      partialize: (state) => ({
        displaySettings: state.displaySettings,
      }),
    }
  )
);
