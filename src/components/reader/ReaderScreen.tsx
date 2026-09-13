import { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  Settings2,
  ExternalLink,
  FileDown,
  StickyNote,
  BookMarked,
  PanelLeft,
} from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useLibraryCache } from "../../stores/libraryCache";
import { saveReadingPosition, getSectionsByPaper, getBlocksByPaper, getPaper, getSetting, saveAnnotation, getGlossary, saveGlossary, markPaperOpened } from "../../services/database";
import { resumeIncompleteTranslation, shouldTranslateBlock } from "../../services/importServiceV2";
import { createBlockUpdateBatcher } from "../../utils/batchBlockUpdates";
import type { ImportConfig } from "../../services/importServiceV2";
import { subscribeTranslationServerReady } from "../../utils/serverReady";
import type { PaperBlock, Section } from "../../types/paper";
import type { Annotation } from "../../types/annotation";
import {
  mergePreferTranslated,
  mergePreferTranslatedSections,
  upsertBlock,
  upsertSection,
} from "../../utils/mergePaperData";
import { displayPaperTitle, isReferencesHeading } from "../../services/translation/quality";
import { useProjectStore } from "../../stores/projectStore";
import { workspaceAncestorPath } from "../../data/workspace/tree";
import { WorkspacePathTrail } from "../workspace/WorkspacePathTrail";
import { translationManager, READER_PRIORITY_DEBOUNCE_MS } from "../../services/translation";
import { openSourcePdf, sourcePdfExists } from "../../services/sourcePdf";
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotationsForPaper,
  updateAnnotationNote,
} from "../../services/annotationService";
import { PaperContent } from "./PaperContent";
import { ExportDialog, type ExportDialogValues } from "./ExportDialog";
import { Outline } from "./Outline";
import { DisplaySettingsPanel } from "./DisplaySettingsPanel";
import { SearchPanel } from "./SearchPanel";
import {
  listSearchHits,
  paintCurrentSearchHit,
  scrollToSearchHit,
  wrapSearchHitIndex,
} from "../../utils/searchHits";
import { NotesPanel } from "./notes/NotesPanel";
import { GlossaryPanel } from "./GlossaryPanel";
import type { GlossaryEntry } from "../../services/llm/types";
import { MemoPopover } from "./memo/MemoPopover";
import { memoRange, type MemoSurface } from "./memo/memoSurface";
import { measureMemoAnchor, rectToAnchor } from "./memo/popoverPosition";
import { useTextSelection } from "./selection/useTextSelection";
import { showToast } from "../../stores/toastStore";
import {
  toggleReaderRightPanel,
  type ReaderRightPanel,
} from "../../utils/readerRightPanel";
import styles from "./ReaderScreen.module.css";

const EMPTY_BLOCKS: PaperBlock[] = [];
const EMPTY_SECTIONS: Section[] = [];

type VisibleBlock = { id: string; offset: number };

function refreshBlockElements(content: HTMLElement): HTMLElement[] {
  return [...content.querySelectorAll<HTMLElement>("[id^='block-']")];
}

function findVisibleBlockId(
  content: HTMLElement,
  elements: HTMLElement[],
  startIndex = 0
): { visible: VisibleBlock | null; index: number } {
  if (elements.length === 0) return { visible: null, index: 0 };
  const contentRect = content.getBoundingClientRect();
  let index = Math.min(Math.max(startIndex, 0), elements.length - 1);
  const elemAt = (i: number) => elements[i];

  while (index > 0 && elemAt(index).getBoundingClientRect().top > contentRect.top + 8) {
    index -= 1;
  }
  while (
    index < elements.length - 1 &&
    elemAt(index).getBoundingClientRect().bottom <= contentRect.top
  ) {
    index += 1;
  }

  const elem = elemAt(index);
  if (!elem) return { visible: null, index };
  const rect = elem.getBoundingClientRect();
  if (rect.bottom <= contentRect.top || rect.top >= contentRect.bottom) {
    return { visible: null, index };
  }
  return {
    visible: {
      id: elem.id.replace("block-", ""),
      offset: contentRect.top - rect.top,
    },
    index,
  };
}

export function ReaderScreen() {
  const navigate = useNavigate();
  const { paperId } = useParams<{ paperId: string }>();
  const [searchParams] = useSearchParams();
  const papers = useLibraryCache((s) => s.papers);
  const workspaceNodes = useProjectStore((state) => state.workspaceNodes);
  const memberships = useProjectStore((state) => state.memberships);
  const displaySettings = useAppStore((s) => s.displaySettings);
  const updatePaper = useLibraryCache((s) => s.updatePaper);
  const setSectionsInStore = useLibraryCache((s) => s.setSections);
  const setBlocksInStore = useLibraryCache((s) => s.setBlocks);
  const updateBlockInStore = useLibraryCache((s) => s.updateBlock);
  const storeSections = useLibraryCache((s) =>
    paperId ? s.sections[paperId] ?? EMPTY_SECTIONS : EMPTY_SECTIONS
  );
  const storeBlocks = useLibraryCache((s) =>
    paperId ? s.blocks[paperId] ?? EMPTY_BLOCKS : EMPTY_BLOCKS
  );

  const [showOutline, setShowOutline] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHitIndex, setSearchHitIndex] = useState(0);
  const [searchHitCount, setSearchHitCount] = useState(0);
  const searchHitIndexRef = useRef(0);
  const searchQueryRef = useRef(searchQuery);
  const showSearchRef = useRef(showSearch);
  searchQueryRef.current = searchQuery;
  showSearchRef.current = showSearch;
  const [isLoading, setIsLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<ReaderRightPanel>("none");
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeAnnotationIds, setActiveAnnotationIds] = useState<string[]>([]);
  const [flashAnnotationIds, setFlashAnnotationIds] = useState<string[]>([]);
  const [memoSurface, setMemoSurface] = useState<MemoSurface | null>(null);
  const [hasSourcePdf, setHasSourcePdf] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const priorityTimeoutRef = useRef<number | null>(null);
  const lastPriorityBlockRef = useRef<string | null>(null);
  const blockElementsRef = useRef<HTMLElement[]>([]);
  const lastVisibleIndexRef = useRef(0);
  const storeBlocksRef = useRef(storeBlocks);
  const blockBatcherRef = useRef(
    createBlockUpdateBatcher((id, batch) => {
      setBlocksInStore(id, (prev) => batch.reduce((acc, block) => upsertBlock(acc, block), prev));
    })
  );
  const flashTimeoutRef = useRef<number | null>(null);
  const memoSurfaceRef = useRef<MemoSurface | null>(null);

  const paper = papers.find((p) => p.id === paperId);
  const { result: selectionResult, dismiss: dismissSelection } = useTextSelection(
    contentRef,
    !isLoading
  );

  const activeWorkspace = useMemo(() => {
    const qid = searchParams.get("workspace");
    if (qid) return workspaceNodes.find((node) => node.id === qid) ?? null;
    if (!paperId) return null;
    const links = memberships.filter((m) => m.paperId === paperId);
    if (links.length === 1) return workspaceNodes.find((node) => node.id === links[0].nodeId) ?? null;
    return null;
  }, [searchParams, workspaceNodes, memberships, paperId]);

  const workspacePath = useMemo(
    () => workspaceAncestorPath(workspaceNodes, activeWorkspace?.id),
    [workspaceNodes, activeWorkspace?.id]
  );

  const annotationWorkspaceNodeId = searchParams.get("workspace")
    ? activeWorkspace?.id ?? null
    : null;

  useEffect(() => {
    storeBlocksRef.current = storeBlocks;
  }, [storeBlocks]);

  useEffect(() => {
    memoSurfaceRef.current = memoSurface;
  }, [memoSurface]);

  useEffect(() => {
    if (selectionResult?.kind === "ok") {
      const next = selectionResult.selection;
      const fallback = rectToAnchor(selectionResult.rect);
      setMemoSurface((current) => {
        if (
          current?.mode === "compose" &&
          current.selection.blockId === next.blockId &&
          current.selection.startOffset === next.startOffset &&
          current.selection.endOffset === next.endOffset
        ) {
          return { ...current, fallback };
        }
        return {
          mode: "compose",
          selection: next,
          note: "",
          error: null,
          saving: false,
          fallback,
        };
      });
      return;
    }
    if (selectionResult?.kind === "cross-block") {
      setMemoSurface({
        mode: "cross-block",
        fallback: rectToAnchor(selectionResult.rect),
      });
    }
  }, [selectionResult]);

  useEffect(() => {
    if (!memoSurface) return;
    const update = () => {
      const current = memoSurfaceRef.current;
      if (!current) return;
      const range = memoRange(current);
      const next = measureMemoAnchor({
        ...range,
        fallback: current.fallback,
      });
      if (!next) return;
      setMemoSurface((surface) => (surface ? { ...surface, fallback: next } : surface));
    };
    const root = contentRef.current;
    root?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      root?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [memoSurface?.mode]);

  const translatableIds = useMemo(() => {
    const refIds = new Set(
      storeSections
        .filter(
          (sec) =>
            sec.normalizedKind === "references" ||
            isReferencesHeading(sec.originalTitle)
        )
        .map((sec) => sec.id)
    );
    return [...storeBlocks]
      .filter((b) => shouldTranslateBlock(b, refIds))
      .sort((a, b) => a.order - b.order)
      .map((b) => b.id);
  }, [storeBlocks, storeSections]);

  const reloadAnnotations = useCallback(async () => {
    if (!paperId) return;
    const list = await listAnnotationsForPaper(paperId, storeBlocksRef.current);
    setAnnotations(list);
  }, [paperId]);

  const handleBlockUpdated = useCallback(
    (updatedBlock: PaperBlock) => {
      if (!paperId) return;
      updateBlockInStore(paperId, updatedBlock.id, updatedBlock);
    },
    [paperId, updateBlockInStore]
  );

  const prioritizeVisible = useCallback(
    (blockId: string) => {
      if (!paperId) return;
      if (lastPriorityBlockRef.current === blockId) return;
      lastPriorityBlockRef.current = blockId;
      translationManager.prioritizeAroundBlock(paperId, blockId, translatableIds);
    },
    [paperId, translatableIds]
  );

  const handleScroll = useCallback(() => {
    if (!paperId || !contentRef.current) return;

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    if (priorityTimeoutRef.current) {
      window.clearTimeout(priorityTimeoutRef.current);
    }

    const found = findVisibleBlockId(
      contentRef.current,
      blockElementsRef.current,
      lastVisibleIndexRef.current
    );
    lastVisibleIndexRef.current = found.index;
    if (found.visible) {
      priorityTimeoutRef.current = window.setTimeout(() => {
        prioritizeVisible(found.visible!.id);
      }, READER_PRIORITY_DEBOUNCE_MS);
    }

    saveTimeoutRef.current = window.setTimeout(async () => {
      const content = contentRef.current;
      if (!content) return;
      const next = findVisibleBlockId(
        content,
        blockElementsRef.current,
        lastVisibleIndexRef.current
      );
      lastVisibleIndexRef.current = next.index;
      if (!next.visible) return;
      try {
        await saveReadingPosition(paperId, next.visible.id, next.visible.offset);
        updatePaper(paperId, {
          lastReadBlockId: next.visible.id,
          lastReadOffset: next.visible.offset,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error("Failed to save reading position:", e);
      }
    }, 1000);
  }, [paperId, updatePaper, prioritizeVisible]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!paperId) {
        setIsLoading(false);
        return;
      }

      try {
        const [dbPaper, dbSections, dbBlocks, dbGlossary] = await Promise.all([
          getPaper(paperId),
          getSectionsByPaper(paperId),
          getBlocksByPaper(paperId),
          getGlossary(paperId),
        ]);
        if (cancelled) return;
        if (dbPaper) {
          updatePaper(dbPaper.id, dbPaper);
          void markPaperOpened(dbPaper.id).then(() => {
            updatePaper(dbPaper.id, { lastOpenedAt: new Date().toISOString() });
          });
        }
        if (dbSections.length > 0) {
          setSectionsInStore(paperId, (prev) =>
            mergePreferTranslatedSections(prev, dbSections)
          );
        }
        if (dbBlocks.length > 0) {
          setBlocksInStore(paperId, (prev) => mergePreferTranslated(prev, dbBlocks));
        }
        setGlossary(dbGlossary);
        const exists = await sourcePdfExists(paperId);
        if (!cancelled) setHasSourcePdf(exists || Boolean(dbPaper?.sourceStoredPath));
      } catch (e) {
        console.error("Failed to load paper data:", e);
      }
      if (!cancelled) setIsLoading(false);
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [paperId, setSectionsInStore, setBlocksInStore, updatePaper]);

  useEffect(() => {
    if (!paperId || isLoading) return;
    void reloadAnnotations();
  }, [paperId, isLoading, reloadAnnotations]);

  useEffect(() => {
    if (!contentRef.current) return;
    blockElementsRef.current = refreshBlockElements(contentRef.current);
    lastVisibleIndexRef.current = 0;
  }, [paperId, isLoading, storeBlocks.length]);

  const resumeStartedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!paperId || isLoading) return;

    let cancelled = false;
    const runResume = async () => {
      const settings = await getSetting<ImportConfig>("translationSettingsV2");
      if (cancelled) return;
      await resumeIncompleteTranslation(
        paperId,
        {
          onBlockTranslated: (block) => {
            blockBatcherRef.current.push(block);
          },
          onPaperUpdated: (updated) => {
            updatePaper(updated.id, updated);
          },
          onSectionTranslated: (section) => {
            setSectionsInStore(paperId, (prev) => upsertSection(prev, section));
          },
        },
        settings || {}
      );
    };

    // First open: try immediately (no-ops if the sidecar is still down).
    if (resumeStartedFor.current !== paperId) {
      resumeStartedFor.current = paperId;
      void runResume();
    }

    // When the sidecar becomes ready after a paper was opened early, resume again.
    const unsubscribe = subscribeTranslationServerReady(() => {
      if (!cancelled) void runResume();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [paperId, isLoading, setBlocksInStore, updatePaper, setSectionsInStore]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === "Escape" && showSearch) {
        setShowSearch(false);
        setSearchQuery("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSearch]);

  const applySearchHits = useCallback(
    (opts: { reset?: boolean; delta?: number; scroll?: boolean }) => {
      const root = contentRef.current;
      const query = searchQueryRef.current;
      const open = showSearchRef.current;
      if (!root || !open || query.length < 2) {
        searchHitIndexRef.current = 0;
        setSearchHitIndex(0);
        setSearchHitCount(0);
        return;
      }

      const hits = listSearchHits(root);
      setSearchHitCount(hits.length);

      let next = searchHitIndexRef.current;
      if (opts.reset) next = 0;
      if (typeof opts.delta === "number" && hits.length > 0) {
        next = wrapSearchHitIndex(next, hits.length, opts.delta);
      }
      if (hits.length === 0) next = 0;
      else next = Math.min(Math.max(0, next), hits.length - 1);

      searchHitIndexRef.current = next;
      setSearchHitIndex(next);
      if (hits.length === 0) return;
      if (opts.scroll) scrollToSearchHit(hits, next);
      else paintCurrentSearchHit(hits, next);
    },
    []
  );

  useLayoutEffect(() => {
    applySearchHits({ reset: true, scroll: searchQuery.length >= 2 });
  }, [searchQuery, showSearch, applySearchHits]);

  useLayoutEffect(() => {
    if (!showSearch || searchQuery.length < 2) return;
    applySearchHits({ scroll: false });
  }, [storeBlocks, showSearch, searchQuery, applySearchHits]);

  useEffect(() => {
    if (!showSearch) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target;
      if (target instanceof HTMLElement) {
        const inSearchPanel = Boolean(target.closest("[data-search-panel]"));
        const tag = target.tagName;
        const typingElsewhere =
          !inSearchPanel &&
          (tag === "TEXTAREA" || tag === "INPUT" || target.isContentEditable);
        if (typingElsewhere) return;
      }

      if (searchQueryRef.current.length < 2) return;

      if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        applySearchHits({ delta: 1, scroll: true });
      } else if (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey)) {
        e.preventDefault();
        applySearchHits({ delta: -1, scroll: true });
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [showSearch, applySearchHits]);

  const handleSearchResultClick = useCallback((blockId: string) => {
    const root = contentRef.current;
    const blockEl = document.getElementById(`block-${blockId}`);
    if (root && blockEl) {
      const firstHit = blockEl.querySelector<HTMLElement>("[data-search-hit]");
      if (firstHit) {
        const hits = listSearchHits(root);
        const index = hits.indexOf(firstHit);
        if (index >= 0) {
          searchHitIndexRef.current = index;
          setSearchHitIndex(index);
          scrollToSearchHit(hits, index);
          return;
        }
      }
    }
    blockEl?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const handleSearchClose = useCallback(() => {
    setShowSearch(false);
    setSearchQuery("");
  }, []);

  const restoredScrollForPaper = useRef<string | null>(null);

  useEffect(() => {
    restoredScrollForPaper.current = null;
  }, [paperId]);

  // Restore once per paper. Do not re-run when translation polling
  // recreates callbacks or updates lastReadBlockId during reading.
  useEffect(() => {
    if (!paper || !contentRef.current || isLoading) return;
    if (restoredScrollForPaper.current === paper.id) return;
    if (!paper.lastReadBlockId) {
      restoredScrollForPaper.current = paper.id;
      return;
    }

    const element = document.getElementById(`block-${paper.lastReadBlockId}`);
    if (!element) return;

    restoredScrollForPaper.current = paper.id;
    const blockId = paper.lastReadBlockId;
    const offset = paper.lastReadOffset;
    window.setTimeout(() => {
      element.scrollIntoView({ block: "start" });
      if (offset) {
        contentRef.current?.scrollBy(0, offset);
      }
      prioritizeVisible(blockId);
    }, 100);
  }, [paper, isLoading, storeBlocks.length, prioritizeVisible]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    content.addEventListener("scroll", handleScroll);
    return () => {
      content.removeEventListener("scroll", handleScroll);
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      if (priorityTimeoutRef.current) {
        window.clearTimeout(priorityTimeoutRef.current);
      }
    };
  }, [handleScroll]);

  useEffect(() => {
    if (!paper && paperId && !isLoading) {
      navigate("/");
    }
  }, [paper, paperId, navigate, isLoading]);

  const handleOpenSourcePdf = useCallback(
    async (page?: number) => {
      if (!paperId) return;
      try {
        await openSourcePdf({ paperId, page });
      } catch (e) {
        console.error("Failed to open source PDF:", e);
      }
    },
    [paperId]
  );

  const handleExport = useCallback(
    async (values: ExportDialogValues) => {
      if (!paperId) return;
      setExportBusy(true);
      setExportError(null);
      setExportStatus("保存先を選んでいます...");
      try {
        const { getStorage } = await import("../../data/runtime");
        const { exportPaperMarkdown, exportVerificationBundle } = await import(
          "../../data/export/markdownExport"
        );
        const { saveMarkdownExport, saveNotionImportExport, saveVerificationExport } = await import(
          "../../data/export/saveExport"
        );
        const { fs } = await getStorage();
        if (values.mode === "verification") {
          const result = await exportVerificationBundle(fs, paperId, {
            includeFailedTranslations: values.includeFailedTranslations,
          });
          setExportStatus("検証用パッケージを書き出しています...");
          const saved = await saveVerificationExport(paperId, result);
          if (!saved) {
            setExportStatus("キャンセルしました");
            return;
          }
          setExportStatus(`書き出しました: ${saved.path}`);
          return;
        }
        const result = await exportPaperMarkdown(fs, paperId, {
          language: "ja",
          variant: values.variant,
          stripBlockIds: values.variant !== "verification",
          includeFailedTranslations: values.includeFailedTranslations,
        });
        if (values.mode === "notion") {
          setExportStatus("Notion インポート用 ZIP を作成しています...");
          const saved = await saveNotionImportExport(result);
          if (!saved) {
            setExportStatus("キャンセルしました");
            return;
          }
          setExportStatus(`Notion 用 ZIP を書き出しました: ${saved.path}`);
          return;
        }
        setExportStatus("Markdown を書き出しています...");
        const saved = await saveMarkdownExport(result);
        if (!saved) {
          setExportStatus("キャンセルしました");
          return;
        }
        setExportStatus(`書き出しました: ${saved.path}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setExportError(message || "書き出しに失敗しました");
        setExportStatus(null);
      } finally {
        setExportBusy(false);
      }
    },
    [paperId]
  );

  const showNotesList = useCallback(() => {
    setRightPanel((current) => toggleReaderRightPanel(current, "notes"));
  }, []);

  const closeMemoSurface = useCallback(() => {
    setMemoSurface(null);
    dismissSelection();
  }, [dismissSelection]);

  const flashAnnotation = useCallback((id: string) => {
    setFlashAnnotationIds([id]);
    if (flashTimeoutRef.current) window.clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = window.setTimeout(() => {
      setFlashAnnotationIds([]);
    }, 2500);
  }, []);

  const handleSaveDraft = useCallback(async () => {
    if (!paperId || memoSurface?.mode !== "compose") return;
    const block = storeBlocks.find((b) => b.id === memoSurface.selection.blockId);
    if (!block?.translated) {
      setMemoSurface((current) =>
        current?.mode === "compose"
          ? { ...current, error: "訳文がまだないため保存できません" }
          : current
      );
      return;
    }
    setMemoSurface((current) =>
      current?.mode === "compose" ? { ...current, saving: true, error: null } : current
    );
    try {
      const created = await createAnnotation({
        paperId,
        workspaceNodeId: annotationWorkspaceNodeId,
        blockId: memoSurface.selection.blockId,
        translated: block.translated,
        startOffset: memoSurface.selection.startOffset,
        endOffset: memoSurface.selection.endOffset,
        selectedText: memoSurface.selection.selectedText,
        note: memoSurface.note,
      });
      setAnnotations((current) =>
        current.some((item) => item.id === created.id) ? current : [...current, created]
      );
      setActiveAnnotationIds([created.id]);
      flashAnnotation(created.id);
      setMemoSurface(null);
      dismissSelection();
      window.getSelection()?.removeAllRanges();
      void reloadAnnotations();
    } catch (error) {
      setMemoSurface((current) =>
        current?.mode === "compose"
          ? {
              ...current,
              saving: false,
              error: error instanceof Error ? error.message : "保存に失敗しました",
            }
          : current
      );
    }
  }, [
    annotationWorkspaceNodeId,
    dismissSelection,
    flashAnnotation,
    memoSurface,
    paperId,
    reloadAnnotations,
    storeBlocks,
  ]);

  const handleSaveEdit = useCallback(async () => {
    if (memoSurface?.mode !== "edit") return;
    setMemoSurface((current) =>
      current?.mode === "edit" ? { ...current, saving: true, error: null } : current
    );
    try {
      const updated = await updateAnnotationNote(memoSurface.annotation, memoSurface.note);
      setAnnotations((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      setMemoSurface({
        mode: "view",
        annotation: updated,
        fallback: memoSurface.fallback,
      });
      void reloadAnnotations();
    } catch (error) {
      setMemoSurface((current) =>
        current?.mode === "edit"
          ? {
              ...current,
              saving: false,
              error: error instanceof Error ? error.message : "保存に失敗しました",
            }
          : current
      );
    }
  }, [memoSurface, reloadAnnotations]);

  const handleSelectAnnotation = useCallback((annotation: Annotation) => {
    setActiveAnnotationIds([annotation.id]);
    const element = document.getElementById(`block-${annotation.blockId}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    flashAnnotation(annotation.id);
    window.setTimeout(() => {
      const measured = measureMemoAnchor({
        blockId: annotation.blockId,
        startOffset: annotation.startOffset,
        endOffset: annotation.endOffset,
      });
      const fallback = measured ?? {
        top: window.innerHeight / 2,
        left: window.innerWidth / 2,
        width: 0,
        height: 0,
      };
      setMemoSurface({ mode: "view", annotation, fallback });
    }, 280);
  }, [flashAnnotation]);

  const handleHighlightClick = useCallback((ids: string[], rect: DOMRect) => {
    const annotation = annotations.find((item) => ids.includes(item.id));
    setActiveAnnotationIds(ids);
    if (!annotation) return;
    setMemoSurface({
      mode: "view",
      annotation,
      fallback: rectToAnchor(rect),
    });
    dismissSelection();
  }, [annotations, dismissSelection]);

  const handleDeleteAnnotation = useCallback(
    async (annotation: Annotation) => {
      await deleteAnnotation(annotation.id);
      setAnnotations((current) => current.filter((item) => item.id !== annotation.id));
      setActiveAnnotationIds((ids) => ids.filter((id) => id !== annotation.id));
      setMemoSurface((current) =>
        current &&
        (current.mode === "view" || current.mode === "edit") &&
        current.annotation.id === annotation.id
          ? null
          : current
      );
      showToast({
        kind: "info",
        message: "メモを削除しました",
        actionLabel: "元に戻す",
        onAction: () => {
          void saveAnnotation(annotation).then(() => {
            setAnnotations((current) =>
              current.some((item) => item.id === annotation.id)
                ? current
                : [...current, annotation]
            );
            void reloadAnnotations();
          });
        },
      });
      void reloadAnnotations();
    },
    [reloadAnnotations]
  );

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>読み込み中...</div>
      </div>
    );
  }

  if (!paper) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          論文が見つかりません。
          <br />
          <button onClick={() => navigate("/")}>ライブラリに戻る</button>
        </div>
      </div>
    );
  }

  const handleBackClick = () => {
    if (activeWorkspace) {
      navigate(`/project/${activeWorkspace.id}`);
      return;
    }
    navigate("/");
  };

  const handleSectionClick = (sectionId: string) => {
    const element = document.getElementById(`section-${sectionId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const contentStyle = {
    "--content-font-size": `${displaySettings.fontSize}px`,
    "--content-line-height": displaySettings.lineHeight,
    "--content-max-width": `${displaySettings.contentWidth}px`,
  } as React.CSSProperties;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button
            className={styles.iconButton}
            onClick={handleBackClick}
            title={activeWorkspace ? "フォルダに戻る" : "ライブラリに戻る"}
          >
            <ArrowLeft size={20} />
          </button>
          <div className={styles.titleArea}>
            {workspacePath.length > 0 ? (
              <WorkspacePathTrail
                folders={workspacePath}
                leaf={{ label: displayPaperTitle(paper) }}
                size="sm"
              />
            ) : (
              <h1 className={styles.title}>{displayPaperTitle(paper)}</h1>
            )}
          </div>
        </div>
        <div className={styles.headerRight}>
          <button
            className={`${styles.iconButton} ${showOutline ? styles.active : ""}`}
            onClick={() => setShowOutline((value) => !value)}
            aria-label={showOutline ? "目次を隠す" : "目次を表示"}
            data-tooltip={showOutline ? "目次を隠す" : "目次を表示"}
          >
            <PanelLeft size={20} />
          </button>
          <button
            className={`${styles.iconButton} ${rightPanel === "glossary" ? styles.active : ""}`}
            onClick={() =>
              setRightPanel((current) => toggleReaderRightPanel(current, "glossary"))
            }
            aria-label="用語集"
            data-tooltip="用語集"
          >
            <BookMarked size={20} />
          </button>
          <button
            className={`${styles.iconButton} ${rightPanel === "notes" ? styles.active : ""}`}
            onClick={showNotesList}
            aria-label="メモ一覧"
            data-tooltip="メモ一覧"
          >
            <StickyNote size={20} />
          </button>
          <button
            className={`${styles.iconButton} ${showSearch ? styles.active : ""}`}
            onClick={() => setShowSearch(!showSearch)}
            aria-label="検索 (⌘F)"
            data-tooltip="検索 (⌘F)"
          >
            <Search size={20} />
          </button>
          <button
            className={`${styles.iconButton} ${showSettings ? styles.active : ""}`}
            onClick={() => setShowSettings(!showSettings)}
            aria-label="表示設定"
            data-tooltip="表示設定"
          >
            <Settings2 size={20} />
          </button>
          <button
            className={`${styles.iconButton} ${showExport ? styles.active : ""}`}
            aria-label="書き出す"
            data-tooltip="書き出す"
            onClick={() => {
              setShowExport(true);
              setExportStatus(null);
              setExportError(null);
            }}
          >
            <FileDown size={20} />
          </button>
          <button
            className={styles.iconButton}
            aria-label={hasSourcePdf ? "元PDFを開く" : "保存された元PDFがありません"}
            data-tooltip={hasSourcePdf ? "元PDFを開く" : "保存された元PDFがありません"}
            disabled={!hasSourcePdf}
            onClick={() => void handleOpenSourcePdf()}
          >
            <ExternalLink size={20} />
          </button>
        </div>
      </header>

      <div className={styles.main}>
        {showOutline && (
          <aside className={styles.sidebar}>
            <Outline
              sections={storeSections}
              activeSection={activeSection}
              onSectionClick={handleSectionClick}
            />
          </aside>
        )}

        <main className={styles.content} style={contentStyle} ref={contentRef}>
          <PaperContent
            paper={paper}
            sections={storeSections}
            blocks={storeBlocks}
            onSectionVisible={setActiveSection}
            highlightText={searchQuery}
            onBlockUpdated={handleBlockUpdated}
            annotations={annotations}
            flashAnnotationIds={flashAnnotationIds}
            onHighlightClick={handleHighlightClick}
            onOpenSourcePdf={(block) => void handleOpenSourcePdf(block.pageStart)}
          />
        </main>

        {rightPanel !== "none" && (
          <aside className={styles.rightPane}>
            {rightPanel === "glossary" && (
              <GlossaryPanel
                entries={glossary}
                onChange={(entries) => {
                  setGlossary(entries);
                  if (paperId) void saveGlossary(paperId, entries);
                }}
                onClose={() => setRightPanel("none")}
              />
            )}
            {rightPanel === "notes" && (
              <NotesPanel
                annotations={annotations}
                activeIds={activeAnnotationIds}
                onSelect={handleSelectAnnotation}
                onDelete={(annotation) => void handleDeleteAnnotation(annotation)}
                onClose={() => setRightPanel("none")}
              />
            )}
          </aside>
        )}
      </div>

      {memoSurface && (
        <MemoPopover
          mode={memoSurface.mode}
          anchor={memoSurface.fallback}
          selection={memoSurface.mode === "compose" ? memoSurface.selection : null}
          annotation={
            memoSurface.mode === "view" || memoSurface.mode === "edit"
              ? memoSurface.annotation
              : null
          }
          note={
            memoSurface.mode === "compose" || memoSurface.mode === "edit"
              ? memoSurface.note
              : ""
          }
          saving={
            memoSurface.mode === "compose" || memoSurface.mode === "edit"
              ? memoSurface.saving
              : false
          }
          error={
            memoSurface.mode === "compose" || memoSurface.mode === "edit"
              ? memoSurface.error
              : null
          }
          onNoteChange={(note) =>
            setMemoSurface((current) =>
              current && (current.mode === "compose" || current.mode === "edit")
                ? { ...current, note }
                : current
            )
          }
          onSave={() => {
            if (memoSurface.mode === "compose") void handleSaveDraft();
            if (memoSurface.mode === "edit") void handleSaveEdit();
          }}
          onCancel={closeMemoSurface}
          onEdit={() => {
            if (memoSurface.mode !== "view") return;
            setMemoSurface({
              mode: "edit",
              annotation: memoSurface.annotation,
              note: memoSurface.annotation.note,
              error: null,
              saving: false,
              fallback: memoSurface.fallback,
            });
          }}
          onDelete={() => {
            if (memoSurface.mode === "view" || memoSurface.mode === "edit") {
              void handleDeleteAnnotation(memoSurface.annotation);
            }
          }}
        />
      )}

      {showSettings && (
        <DisplaySettingsPanel onClose={() => setShowSettings(false)} />
      )}

      {showSearch && (
        <SearchPanel
          blocks={storeBlocks}
          sections={storeSections}
          hitIndex={searchHitIndex}
          hitCount={searchHitCount}
          onClose={handleSearchClose}
          onResultClick={handleSearchResultClick}
          onSearchChange={setSearchQuery}
          onStep={(delta) => applySearchHits({ delta, scroll: true })}
        />
      )}

      <ExportDialog
        open={showExport}
        busy={exportBusy}
        status={exportStatus}
        error={exportError}
        onClose={() => {
          if (!exportBusy) setShowExport(false);
        }}
        onExport={(values) => void handleExport(values)}
      />
    </div>
  );
}
