import { useState, useCallback, type ReactNode } from "react";
import { Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import type { PaperBlock } from "../../types/paper";
import type { Annotation } from "../../types/annotation";
import { useAppStore } from "../../stores/appStore";
import { updateBlock, getSetting } from "../../services/database";
import { MADLADEngine } from "../../services/translation/madladEngine";
import type { ImportConfig } from "../../services/importServiceV2";
import { usableTranslatedText, looksLikeBibliographyEntry, isReferencesHeading } from "../../services/translation/quality";
import { isLowExtractionConfidence } from "../../services/extractionConfidence";
import { splitHighlightedText } from "../../services/highlightRanges";
import styles from "./Paragraph.module.css";

type ParagraphProps = {
  block: PaperBlock;
  highlightText?: string;
  onBlockUpdated?: (block: PaperBlock) => void;
  annotations?: Annotation[];
  flashAnnotationIds?: string[];
  onHighlightClick?: (annotationIds: string[]) => void;
  onOpenSourcePdf?: (block: PaperBlock) => void;
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
}: ParagraphProps) {
  const { expandedOriginalBlocks, toggleOriginalExpanded } = useAppStore();
  const [isRetrying, setIsRetrying] = useState(false);
  const [showConfidence, setShowConfidence] = useState(false);

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

      const updatedBlock: PaperBlock = {
        ...block,
        translated: result.text,
        translationStatus: "completed",
      };

      await updateBlock(updatedBlock);
      onBlockUpdated?.(updatedBlock);
    } catch (e) {
      console.error("Retry failed:", e);
    } finally {
      setIsRetrying(false);
    }
  }, [block, isRetrying, onBlockUpdated]);

  const renderTranslated = (text: string): ReactNode => {
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
              : highlightText
                ? highlightMatches(displayText, highlightText)
                : displayText}
          </p>

          {lowConfidence && (
            <div className={styles.confidence}>
              <button
                type="button"
                className={styles.confidenceButton}
                title="抽出精度が低い可能性があります"
                onClick={() => setShowConfidence((v) => !v)}
              >
                !
              </button>
              {showConfidence && (
                <div className={styles.confidenceMenu}>
                  <p>抽出精度が低い可能性があります</p>
                  {hasOriginal && (
                    <button type="button" onClick={handleToggle}>
                      原文を見る
                    </button>
                  )}
                  <button type="button" onClick={() => onOpenSourcePdf?.(block)}>
                    元PDFを見る
                  </button>
                </div>
              )}
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
