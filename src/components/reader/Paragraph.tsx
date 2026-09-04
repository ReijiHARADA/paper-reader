import { useState, useCallback, type ReactNode } from "react";
import { Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import type { PaperBlock } from "../../types/paper";
import type { Annotation } from "../../types/annotation";
import { useAppStore } from "../../stores/appStore";
import { updateBlock, getGlossary, getSetting } from "../../services/database";
import { MADLADEngine } from "../../services/translation/madladEngine";
import type { ImportConfig } from "../../services/importServiceV2";
import { usableTranslatedText, looksLikeBibliographyEntry, isReferencesHeading } from "../../services/translation/quality";
import { isLowExtractionConfidence } from "../../services/extractionConfidence";
import { splitHighlightedText } from "../../services/highlightRanges";
import { parseCitationGroups, uniqueCitationTarget } from "../../services/citations";
import { applyGlossary } from "../../services/llm/glossaryService";
import styles from "./Paragraph.module.css";

type ParagraphProps = {
  block: PaperBlock;
  highlightText?: string;
  onBlockUpdated?: (block: PaperBlock) => void;
  annotations?: Annotation[];
  flashAnnotationIds?: string[];
  onHighlightClick?: (annotationIds: string[]) => void;
  onOpenSourcePdf?: (block: PaperBlock) => void;
  referenceIndex?: Map<string, string>;
};

function highlightMatches(text: string, query: string): ReactNode {
  if (!query || query.length < 2) return text;

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className={styles.highlight}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function Paragraph({
  block,
  highlightText,
  onBlockUpdated,
  annotations = [],
  flashAnnotationIds = [],
  onHighlightClick,
  onOpenSourcePdf,
  referenceIndex,
}: ParagraphProps) {
  const { expandedOriginalBlocks, toggleOriginalExpanded } = useAppStore();
  const [isRetrying, setIsRetrying] = useState(false);

  const isExpanded = expandedOriginalBlocks.has(block.id);
  const skipTranslation =
    looksLikeBibliographyEntry(block.original || "") ||
    isReferencesHeading(block.original || "");
  const translated = skipTranslation
    ? null
    : usableTranslatedText(block.translated, block.original);
  const hasTranslation = Boolean(translated);
  const hasOriginal = Boolean(block.original && translated);
  const isPending = block.translationStatus === "pending";
  const isProcessing = block.translationStatus === "processing";
  const isFailed = block.translationStatus === "failed" && !hasTranslation;
  const isWaiting = !hasTranslation && (isPending || isProcessing);
  const lowConfidence = isLowExtractionConfidence(block.extractionConfidence);

  const handleToggle = () => {
    toggleOriginalExpanded(block.id);
  };

  const handleRetry = useCallback(async () => {
    if (!block.original || isRetrying) return;

    setIsRetrying(true);
    try {
      const v2 = await getSetting<ImportConfig>("translationSettingsV2");
      const engine = new MADLADEngine(v2?.madladServerUrl);
      const result = await engine.translate(block.original, "en", "ja");
      const glossary = await getGlossary(block.paperId);
      const text = applyGlossary(result.text, glossary);

      const updatedBlock: PaperBlock = {
        ...block,
        translated: text,
        translationStatus: "completed",
        metadata:
          block.type === "figure" || block.type === "table"
            ? { ...block.metadata, captionTranslated: text }
            : block.metadata,
      };

      await updateBlock(updatedBlock);
      onBlockUpdated?.(updatedBlock);
    } catch (e) {
      console.error("Retry failed:", e);
    } finally {
      setIsRetrying(false);
    }
  }, [block, isRetrying, onBlockUpdated]);

  const renderCited = (text: string): ReactNode => {
    const groups = referenceIndex && referenceIndex.size > 0 ? parseCitationGroups(text) : [];
    if (groups.length === 0) {
      return highlightText ? highlightMatches(text, highlightText) : text;
    }
    const parts: ReactNode[] = [];
    let cursor = 0;
    groups.forEach((group, i) => {
      if (group.start > cursor) {
        const slice = text.slice(cursor, group.start);
        parts.push(
          <span key={`t-${i}`}>
            {highlightText ? highlightMatches(slice, highlightText) : slice}
          </span>
        );
      }
      const target = uniqueCitationTarget(group.keys, referenceIndex!);
      const cited = text.slice(group.start, group.end);
      if (target) {
        parts.push(
          <a
            key={`c-${i}`}
            className={styles.citation}
            href={`#block-${target}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(`block-${target}`)?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }}
          >
            {cited}
          </a>
        );
      } else {
        parts.push(<span key={`c-${i}`}>{cited}</span>);
      }
      cursor = group.end;
    });
    if (cursor < text.length) {
      const slice = text.slice(cursor);
      parts.push(
        <span key="t-end">
          {highlightText ? highlightMatches(slice, highlightText) : slice}
        </span>
      );
    }
    return parts;
  };

  const renderTranslated = (text: string): ReactNode => {
    if (annotations.length === 0) return renderCited(text);
    const segments = splitHighlightedText(
      text,
      annotations.map((a) => ({
        id: a.id,
        start: a.startOffset,
        end: a.endOffset,
        status: a.status,
      }))
    );

    return segments.map((seg, i) => {
      const inner = highlightText ? highlightMatches(seg.text, highlightText) : seg.text;
      if (seg.annotationIds.length === 0) {
        return <span key={i}>{inner}</span>;
      }
      const flashing = flashAnnotationIds.some((id) =>
        seg.annotationIds.includes(id)
      );
      return (
        <mark
          key={i}
          className={`${styles.annotationMark} ${flashing ? styles.annotationFlash : ""}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onHighlightClick?.(seg.annotationIds);
          }}
        >
          {inner}
        </mark>
      );
    });
  };

  const displayText = translated || block.original || "";

  return (
    <div
      className={`${styles.container} ${isWaiting ? styles.pending : ""} ${isExpanded ? styles.expanded : ""}`}
    >
      {isWaiting ? (
        <div className={styles.pendingContent}>
          <Loader2 size={16} className={styles.spinner} />
          <span className={styles.pendingText}>
            {isProcessing ? "翻訳中..." : "翻訳待ち"}
          </span>
          {block.original && (
            <p className={styles.originalPreview}>
              {block.original.length > 200
                ? block.original.substring(0, 200) + "..."
                : block.original}
            </p>
          )}
        </div>
      ) : isFailed ? (
        <div className={styles.failedContent}>
          <div className={styles.failedHeader}>
            <p className={styles.failedText}>翻訳に失敗しました</p>
            <button
              className={styles.retryButton}
              onClick={handleRetry}
              disabled={isRetrying}
              title="再翻訳"
            >
              <RefreshCw size={14} className={isRetrying ? styles.spinning : ""} />
              {isRetrying ? "翻訳中..." : "再試行"}
            </button>
          </div>
          {block.original && (
            <p className={styles.originalFallback}>{block.original}</p>
          )}
        </div>
      ) : (
        <>
          <p
            className={styles.translated}
            data-paper-block-id={block.id}
            data-text-role={hasTranslation ? "translation" : "original"}
          >
            {hasTranslation
              ? renderTranslated(translated!)
              : renderCited(displayText)}
          </p>

          {lowConfidence && (
            <div className={styles.confidenceBanner}>
              <p>この箇所の読み順は不確かなことがあります。</p>
              <button type="button" onClick={() => onOpenSourcePdf?.(block)}>
                元PDFを見る
              </button>
            </div>
          )}

          {hasOriginal && (
            <button
              type="button"
              className={styles.toggleButton}
              onClick={handleToggle}
              title={isExpanded ? "原文を隠す" : "原文を表示"}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? "原文を隠す" : "原文を表示"}
            >
              {isExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}

          {isExpanded && block.original && (
            <div className={styles.originalWrapper}>
              <p className={styles.original}>
                {highlightText
                  ? highlightMatches(block.original, highlightText)
                  : block.original}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
