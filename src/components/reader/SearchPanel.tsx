import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import type { PaperBlock, Section } from "../../types/paper";
import { sectionDisplayTitle } from "../../services/translation/quality";
import styles from "./SearchPanel.module.css";

type SearchResult = {
  block: PaperBlock;
  section?: Section;
  matchType: "translated" | "original";
  snippet: string;
};

type SearchPanelProps = {
  blocks: PaperBlock[];
  sections: Section[];
  hitIndex: number;
  hitCount: number;
  onClose: () => void;
  onResultClick: (blockId: string) => void;
  onSearchChange: (query: string) => void;
  onStep: (delta: number) => void;
};

export function SearchPanel({
  blocks,
  sections,
  hitIndex,
  hitCount,
  onClose,
  onResultClick,
  onSearchChange,
  onStep,
}: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    onSearchChange(query);
  }, [query, onSearchChange]);

  const results = useMemo(() => {
    if (query.length < 2) return [];

    const searchResults: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();
    const sectionMap = new Map(sections.map((s) => [s.id, s]));

    for (const block of blocks) {
      if (block.type === "heading" || block.type === "reference") continue;

      const section = block.sectionId ? sectionMap.get(block.sectionId) : undefined;

      // Search in translated text
      if (block.translated && block.translated.toLowerCase().includes(lowerQuery)) {
        const index = block.translated.toLowerCase().indexOf(lowerQuery);
        const start = Math.max(0, index - 30);
        const end = Math.min(block.translated.length, index + query.length + 50);
        const snippet =
          (start > 0 ? "..." : "") +
          block.translated.substring(start, end) +
          (end < block.translated.length ? "..." : "");

        searchResults.push({
          block,
          section,
          matchType: "translated",
          snippet,
        });
      }
      // Search in original text
      else if (block.original && block.original.toLowerCase().includes(lowerQuery)) {
        const index = block.original.toLowerCase().indexOf(lowerQuery);
        const start = Math.max(0, index - 30);
        const end = Math.min(block.original.length, index + query.length + 50);
        const snippet =
          (start > 0 ? "..." : "") +
          block.original.substring(start, end) +
          (end < block.original.length ? "..." : "");

        searchResults.push({
          block,
          section,
          matchType: "original",
          snippet,
        });
      }
    }

    return searchResults.slice(0, 50);
  }, [query, blocks, sections]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  const highlightMatch = (text: string): React.ReactNode => {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <mark key={i} className={styles.highlight}>
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className={styles.panel} data-search-panel="">
      <div className={styles.header}>
        <div className={styles.inputWrapper}>
          <Search size={16} className={styles.searchIcon} />
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            placeholder="この論文を検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {query && (
            <button
              className={styles.clearButton}
              onClick={() => setQuery("")}
              title="クリア"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button className={styles.closeButton} onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      {query.length >= 2 && (
        <div className={styles.results}>
          {results.length === 0 ? (
            <p className={styles.noResults}>検索結果がありません</p>
          ) : (
            <>
              <p className={styles.resultCount}>
                {hitCount > 0
                  ? `${hitIndex + 1} / ${hitCount} 件`
                  : `${results.length}件の結果`}
                {results.length === 50 && " (最初の50件を表示)"}
              </p>
              <ul className={styles.resultList}>
                {results.map((result, index) => (
                  <li
                    key={`${result.block.id}-${result.matchType}`}
                    className={`${styles.resultItem} ${
                      index === selectedIndex ? styles.selected : ""
                    }`}
                    onClick={() => {
                      setSelectedIndex(index);
                      onResultClick(result.block.id);
                    }}
                  >
                    {result.section && (
                      <span className={styles.sectionName}>
                        {sectionDisplayTitle(result.section)}
                      </span>
                    )}
                    <p className={styles.snippet}>
                      {highlightMatch(result.snippet)}
                    </p>
                    <span className={styles.matchType}>
                      {result.matchType === "translated" ? "日本語" : "英語原文"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className={styles.footer}>
        <div className={styles.hint}>
          <button
            type="button"
            className={styles.stepButton}
            onClick={() => onStep(-1)}
            disabled={hitCount === 0}
            title="前のヒット"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            className={styles.stepButton}
            onClick={() => onStep(1)}
            disabled={hitCount === 0}
            title="次のヒット"
          >
            <ChevronDown size={14} />
          </button>
          <span>↑↓ / Enter で次へ</span>
          <span className={styles.separator}>|</span>
          <span>Shift+Enter で前へ</span>
          <span className={styles.separator}>|</span>
          <span>Esc で閉じる</span>
        </div>
      </div>
    </div>
  );
}
