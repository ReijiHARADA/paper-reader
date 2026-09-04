import { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  Settings2,
  ExternalLink,
  FileDown,
  StickyNote,
  BookMarked,
} from "lucide-react";
import { useAppStore, usePaperDataStore } from "../../stores/appStore";
import { saveReadingPosition, getSectionsByPaper, getBlocksByPaper, getPaper, getSetting, saveAnnotation, getGlossary, saveGlossary } from "../../services/database";
import { resumeIncompleteTranslation, shouldTranslateBlock } from "../../services/importServiceV2";
import type { ImportConfig } from "../../services/importServiceV2";
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
import { translationManager, READER_PRIORITY_DEBOUNCE_MS } from "../../services/translation";
import { openSourcePdf, sourcePdfExists } from "../../services/sourcePdf";
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotationsForPaper,
  updateAnnotationNote,
} from "../../services/annotationService";
import { PaperContent } from "./PaperContent";
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
import { SelectionActionMenu } from "./selection/SelectionActionMenu";
import { useTextSelection } from "./selection/useTextSelection";
import type { TranslationSelection } from "./selection/selectionAnchor";
import {
  toggleReaderRightPanel,
  type ReaderRightPanel,
} from "../../utils/readerRightPanel";
import styles from "./ReaderScreen.module.css";

const EMPTY_BLOCKS: PaperBlock[] = [];
const EMPTY_SECTIONS: Section[] = [];

function findVisibleBlockId(content: HTMLElement): { id: string; offset: number } | null {
  const blockElements = content.querySelectorAll("[id^='block-']");
  const contentRect = content.getBoundingClientRect();
  for (const elem of blockElements) {
    const rect = elem.getBoundingClientRect();
    if (rect.top >= contentRect.top && rect.top < contentRect.bottom) {
      return {
        id: elem.id.replace("block-", ""),
        offset: contentRect.top - rect.top,
      };
    }
  }
  return null;
}

export function ReaderScreen() {
  const navigate = useNavigate();
  const { paperId } = useParams<{ paperId: string }>();
  const [searchParams] = useSearchParams();
  const papers = useAppStore((s) => s.papers);
  const { projects, memberships } = useProjectStore();
  const displaySettings = useAppStore((s) => s.displaySettings);
  const updatePaper = useAppStore((s) => s.updatePaper);
  const setSectionsInStore = usePaperDataStore((s) => s.setSections);
  const setBlocksInStore = usePaperDataStore((s) => s.setBlocks);
  const updateBlockInStore = usePaperDataStore((s) => s.updateBlock);
  const storeSections = usePaperDataStore((s) =>
    paperId ? s.sections[paperId] ?? EMPTY_SECTIONS : EMPTY_SECTIONS
  );
  const storeBlocks = usePaperDataStore((s) =>
    paperId ? s.blocks[paperId] ?? EMPTY_BLOCKS : EMPTY_BLOCKS
  );
  const pendingCount = usePaperDataStore((s) => {
    const list = paperId ? s.blocks[paperId] ?? EMPTY_BLOCKS : EMPTY_BLOCKS;
    const sectionList = paperId ? s.sections[paperId] ?? EMPTY_SECTIONS : EMPTY_SECTIONS;
    const refIds = new Set(
      sectionList
        .filter(
          (sec) =>
            sec.normalizedKind === "references" ||
            isReferencesHeading(sec.originalTitle)
        )
        .map((sec) => sec.id)
    );
    return list.filter((b) => shouldTranslateBlock(b, refIds) && !b.translated)
      .length;
  });

  const [showOutline] = useState(true);
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
  const [draft, setDraft] = useState<{
    selection: TranslationSelection;
    note: string;
  } | null>(null);
  const [editing, setEditing] = useState<Annotation | null>(null);
  const [undo, setUndo] = useState<Annotation | null>(null);
  const [hasSourcePdf, setHasSourcePdf] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const priorityTimeoutRef = useRef<number | null>(null);
  const lastPriorityBlockRef = useRef<string | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);
  const undoTimeoutRef = useRef<number | null>(null);

  const paper = papers.find((p) => p.id === paperId);
  const { result: selectionResult, dismiss: dismissSelection } = useTextSelection(
    contentRef,
    !isLoading
  );

  const activeProject = useMemo(() => {
    const qid = searchParams.get("project");
    if (qid) return projects.find((p) => p.id === qid) ?? null;
    if (!paperId) return null;
    const links = memberships.filter((m) => m.paperId === paperId);
    if (links.length === 1) return projects.find((p) => p.id === links[0].projectId) ?? null;
    return null;
  }, [searchParams, projects, memberships, paperId]);

  const annotationProjectId = searchParams.get("project")
    ? activeProject?.id ?? null
    : null;

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
    const list = await listAnnotationsForPaper(paperId, storeBlocks);
    setAnnotations(list);
  }, [paperId, storeBlocks]);

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

    const visible = findVisibleBlockId(contentRef.current);
    if (visible) {
      priorityTimeoutRef.current = window.setTimeout(() => {
        prioritizeVisible(visible.id);
      }, READER_PRIORITY_DEBOUNCE_MS);
    }

    saveTimeoutRef.current = window.setTimeout(async () => {
      const content = contentRef.current;
      if (!content) return;
      const next = findVisibleBlockId(content);
      if (!next) return;
      try {
        await saveReadingPosition(paperId, next.id, next.offset);
        updatePaper(paperId, {
          lastReadBlockId: next.id,
          lastReadOffset: next.offset,
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
    if (!paperId || isLoading) return;
    if (pendingCount === 0 && (paper?.processingStatus === "ready" || paper?.processingStatus === "partial" || paper?.processingStatus === "failed")) return;

    const interval = window.setInterval(async () => {
      try {
        const [dbPaper, dbBlocks, dbSections] = await Promise.all([
          getPaper(paperId),
          getBlocksByPaper(paperId),
          getSectionsByPaper(paperId),
        ]);
        if (dbPaper) {
          updatePaper(paperId, dbPaper);
        }
        setBlocksInStore(paperId, (prev) => mergePreferTranslated(prev, dbBlocks));
        if (dbSections.length > 0) {
          setSectionsInStore(paperId, (prev) =>
            mergePreferTranslatedSections(prev, dbSections)
          );
        }
      } catch (e) {
        console.error("Failed to poll translations:", e);
      }
    }, 1500);

    return () => window.clearInterval(interval);
  }, [
    paperId,
    isLoading,
    paper?.processingStatus,
    pendingCount,
    updatePaper,
    setBlocksInStore,
    setSectionsInStore,
  ]);

  const resumeStartedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!paperId || isLoading) return;
    if (resumeStartedFor.current === paperId) return;
    resumeStartedFor.current = paperId;

    let cancelled = false;
    (async () => {
      const settings = await getSetting<ImportConfig>("translationSettingsV2");
      if (cancelled) return;
      await resumeIncompleteTranslation(
        paperId,
        {
          onBlockTranslated: (block) => {
            setBlocksInStore(paperId, (prev) => upsertBlock(prev, block));
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
    })();

    return () => {
      cancelled = true;
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

  const handleExportMarkdown = useCallback(async () => {
    if (!paperId) return;
    try {
      const { getStorage } = await import("../../data/runtime");
      const { exportPaperMarkdown } = await import("../../data/export/markdownExport");
      const { fs } = await getStorage();
      const result = await exportPaperMarkdown(fs, paperId, {
        language: "ja",
        stripBlockIds: true,
      });
      const blob = new Blob([result.markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${result.fileName}.md`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export markdown:", error);
    }
  }, [paperId]);

  const handleAddMemo = useCallback((selection: TranslationSelection) => {
    setDraft({ selection, note: "" });
    setEditing(null);
    setRightPanel("notes");
    setActiveAnnotationIds([]);
    dismissSelection();
    window.getSelection()?.removeAllRanges();
  }, [dismissSelection]);

  const showNotesList = useCallback(() => {
    setRightPanel((current) => toggleReaderRightPanel(current, "notes"));
  }, []);

  const handleSaveDraft = useCallback(async () => {
    if (!paperId || !draft) return;
    const block = storeBlocks.find((b) => b.id === draft.selection.blockId);
    if (!block?.translated) return;
    const created = await createAnnotation({
      paperId,
      projectId: annotationProjectId,
      blockId: draft.selection.blockId,
      translated: block.translated,
      startOffset: draft.selection.startOffset,
      endOffset: draft.selection.endOffset,
      selectedText: draft.selection.selectedText,
      note: draft.note,
    });
    setDraft(null);
    setEditing(null);
    setActiveAnnotationIds([created.id]);
    await reloadAnnotations();
  }, [paperId, draft, storeBlocks, annotationProjectId, reloadAnnotations]);

  const handleSaveEdit = useCallback(async () => {
    if (!editing) return;
    const updated = await updateAnnotationNote(editing, editing.note);
    setEditing(updated);
    await reloadAnnotations();
  }, [editing, reloadAnnotations]);

  const handleSelectAnnotation = useCallback((annotation: Annotation) => {
    setEditing(annotation);
    setDraft(null);
    setRightPanel("notes");
    setActiveAnnotationIds([annotation.id]);
    const element = document.getElementById(`block-${annotation.blockId}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashAnnotationIds([annotation.id]);
    if (flashTimeoutRef.current) window.clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = window.setTimeout(() => {
      setFlashAnnotationIds([]);
    }, 2500);
  }, []);

  const handleHighlightClick = useCallback((ids: string[]) => {
    setRightPanel("notes");
    setActiveAnnotationIds(ids);
    setEditing(null);
    setDraft(null);
  }, []);

  const handleDeleteAnnotation = useCallback(
    async (annotation: Annotation) => {
      await deleteAnnotation(annotation.id);
      setUndo(annotation);
      if (editing?.id === annotation.id) setEditing(null);
      setActiveAnnotationIds((ids) => ids.filter((id) => id !== annotation.id));
      await reloadAnnotations();
      if (undoTimeoutRef.current) window.clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = window.setTimeout(() => setUndo(null), 5000);
    },
    [editing, reloadAnnotations]
  );

  const handleUndoDelete = useCallback(async () => {
    if (!undo) return;
    await saveAnnotation(undo);
    setUndo(null);
    await reloadAnnotations();
  }, [undo, reloadAnnotations]);

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
            title="ライブラリに戻る"
          >
            <ArrowLeft size={20} />
          </button>
          <div className={styles.titleArea}>
            {activeProject && (
              <Link
                to={`/project/${activeProject.id}`}
                className={styles.breadcrumb}
                title={activeProject.name}
              >
                {activeProject.name}
              </Link>
            )}
            {activeProject && <span className={styles.breadcrumbSep}>/</span>}
            <h1 className={styles.title}>
              {displayPaperTitle(paper)}
            </h1>
          </div>
        </div>
        <div className={styles.headerRight}>
          <button
            className={`${styles.iconButton} ${rightPanel === "glossary" ? styles.active : ""}`}
            onClick={() =>
              setRightPanel((current) => toggleReaderRightPanel(current, "glossary"))
            }
            title="用語集"
          >
            <BookMarked size={20} />
          </button>
          <button
            className={`${styles.iconButton} ${rightPanel === "notes" ? styles.active : ""}`}
            onClick={showNotesList}
            title="メモ一覧"
          >
            <StickyNote size={20} />
          </button>
          <button
            className={`${styles.iconButton} ${showSearch ? styles.active : ""}`}
            onClick={() => setShowSearch(!showSearch)}
            title="検索 (⌘F)"
          >
            <Search size={20} />
          </button>
          <button
            className={`${styles.iconButton} ${showSettings ? styles.active : ""}`}
            onClick={() => setShowSettings(!showSettings)}
            title="表示設定"
          >
            <Settings2 size={20} />
          </button>
          <button
            className={styles.iconButton}
            title="Markdown を書き出す"
            onClick={() => void handleExportMarkdown()}
          >
            <FileDown size={20} />
          </button>
          <button
            className={styles.iconButton}
            title={hasSourcePdf ? "元PDFを開く" : "保存された元PDFがありません"}
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
            draft={
              draft
                ? { selectedText: draft.selection.selectedText, note: draft.note }
                : null
            }
            editing={draft ? null : editing}
            activeIds={activeAnnotationIds}
            undoLabel={undo ? "メモを削除しました" : null}
            onDraftNoteChange={(note) =>
              setDraft((prev) => (prev ? { ...prev, note } : prev))
            }
            onSaveDraft={() => void handleSaveDraft()}
            onEditNoteChange={(note) =>
              setEditing((prev) => (prev ? { ...prev, note } : prev))
            }
            onSaveEdit={() => void handleSaveEdit()}
            onSelect={handleSelectAnnotation}
            onDelete={(annotation) => void handleDeleteAnnotation(annotation)}
            onUndoDelete={() => void handleUndoDelete()}
            onClose={() => setRightPanel("none")}
          />
        )}
      </div>

      {(selectionResult?.kind === "ok" ||
        selectionResult?.kind === "cross-block") && (
        <SelectionActionMenu
          rect={selectionResult.rect}
          selection={
            selectionResult.kind === "ok" ? selectionResult.selection : null
          }
          crossBlock={selectionResult.kind === "cross-block"}
          onAddMemo={handleAddMemo}
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
    </div>
  );
}
