import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  Settings2,
  PanelLeftClose,
  PanelLeft,
  ExternalLink,
} from "lucide-react";
import { useAppStore, usePaperDataStore } from "../../stores/appStore";
import { saveReadingPosition, getSectionsByPaper, getBlocksByPaper, getPaper, getSetting } from "../../services/database";
import { resumeIncompleteTranslation } from "../../services/importServiceV2";
import type { ImportConfig } from "../../services/importServiceV2";
import type { PaperBlock, Section } from "../../types/paper";
import {
  mergePreferTranslated,
  mergePreferTranslatedSections,
  upsertBlock,
  upsertSection,
} from "../../utils/mergePaperData";
import { displayPaperTitle, looksLikeBibliographyEntry, isReferencesHeading } from "../../services/translation/quality";
import { PaperContent } from "./PaperContent";
import { Outline } from "./Outline";
import { DisplaySettingsPanel } from "./DisplaySettingsPanel";
import { SearchPanel } from "./SearchPanel";
import styles from "./ReaderScreen.module.css";

const EMPTY_BLOCKS: PaperBlock[] = [];
const EMPTY_SECTIONS: Section[] = [];

export function ReaderScreen() {
  const navigate = useNavigate();
  const { paperId } = useParams<{ paperId: string }>();
  const papers = useAppStore((s) => s.papers);
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
    return list.filter(
      (b) =>
        b.original &&
        !b.translated &&
        b.translationStatus !== "skipped" &&
        b.translationStatus !== "failed" &&
        (b.type === "paragraph" || b.type === "heading") &&
        b.type !== "reference" &&
        !(b.sectionId && refIds.has(b.sectionId)) &&
        !looksLikeBibliographyEntry(b.original) &&
        !isReferencesHeading(b.original) &&
        String(b.metadata?.role ?? "") !== "author" &&
        String(b.metadata?.role ?? "") !== "affiliation"
    ).length;
  });

  const [showOutline, setShowOutline] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  const paper = papers.find((p) => p.id === paperId);

  // All hooks must be called before any conditional returns
  const handleBlockUpdated = useCallback(
    (updatedBlock: PaperBlock) => {
      if (!paperId) return;
      updateBlockInStore(paperId, updatedBlock.id, updatedBlock);
    },
    [paperId, updateBlockInStore]
  );

  const handleScroll = useCallback(() => {
    if (!paperId || !contentRef.current) return;

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(async () => {
      const content = contentRef.current;
      if (!content) return;

      const blockElements = content.querySelectorAll("[id^='block-']");
      let visibleBlockId: string | null = null;
      let offset = 0;

      for (const elem of blockElements) {
        const rect = elem.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();

        if (rect.top >= contentRect.top && rect.top < contentRect.bottom) {
          visibleBlockId = elem.id.replace("block-", "");
          offset = contentRect.top - rect.top;
          break;
        }
      }

      if (visibleBlockId) {
        try {
          await saveReadingPosition(paperId, visibleBlockId, offset);
          updatePaper(paperId, {
            lastReadBlockId: visibleBlockId,
            lastReadOffset: offset,
            updatedAt: new Date().toISOString(),
          });
        } catch (e) {
          console.error("Failed to save reading position:", e);
        }
      }
    }, 1000);
  }, [paperId, updatePaper]);

  // Load from IndexedDB once. Do not depend on the whole store object —
  // that used to re-fetch stale pending blocks and overwrite live translations.
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!paperId) {
        setIsLoading(false);
        return;
      }

      try {
        const [dbPaper, dbSections, dbBlocks] = await Promise.all([
          getPaper(paperId),
          getSectionsByPaper(paperId),
          getBlocksByPaper(paperId),
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

  // Poll IndexedDB while translation is still in flight
  useEffect(() => {
    if (!paperId || isLoading) return;
    if (pendingCount === 0 && paper?.processingStatus === "ready") return;

    const interval = window.setInterval(async () => {
      try {
        const [dbPaper, dbBlocks, dbSections] = await Promise.all([
          getPaper(paperId),
          getBlocksByPaper(paperId),
          getSectionsByPaper(paperId),
        ]);
        if (dbPaper) {
          updatePaper(dbPaper.id, dbPaper);
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

  // Resume translation for papers left pending after a crash / reload
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

  // Keyboard shortcuts
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

  // Restore reading position
  useEffect(() => {
    if (!paper || !contentRef.current || isLoading) return;

    if (paper.lastReadBlockId) {
      const element = document.getElementById(`block-${paper.lastReadBlockId}`);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ block: "start" });
          if (paper.lastReadOffset) {
            contentRef.current?.scrollBy(0, paper.lastReadOffset);
          }
        }, 100);
      }
    }
  }, [paper?.lastReadBlockId, isLoading]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    content.addEventListener("scroll", handleScroll);
    return () => {
      content.removeEventListener("scroll", handleScroll);
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [handleScroll]);

  // Redirect if paper not found
  useEffect(() => {
    if (!paper && paperId && !isLoading) {
      navigate("/");
    }
  }, [paper, paperId, navigate, isLoading]);

  // Conditional returns after all hooks
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

  const handleSearchResultClick = (blockId: string) => {
    const element = document.getElementById(`block-${blockId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleSearchClose = () => {
    setShowSearch(false);
    setSearchQuery("");
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
          <button
            className={styles.iconButton}
            onClick={() => setShowOutline(!showOutline)}
            title={showOutline ? "アウトラインを隠す" : "アウトラインを表示"}
          >
            {showOutline ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}
          </button>
          <h1 className={styles.title}>
            {displayPaperTitle(paper)}
          </h1>
        </div>
        <div className={styles.headerRight}>
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
          <button className={styles.iconButton} title="元PDFを開く">
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
          />
        </main>
      </div>

      {showSettings && (
        <DisplaySettingsPanel onClose={() => setShowSettings(false)} />
      )}

      {showSearch && (
        <SearchPanel
          blocks={storeBlocks}
          sections={storeSections}
          onClose={handleSearchClose}
          onResultClick={handleSearchResultClick}
          onSearchChange={setSearchQuery}
        />
      )}
    </div>
  );
}

