import type { ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
} from "lucide-react";
import type { Paper } from "../../types/paper";
import { useLibraryCache } from "../../stores/libraryCache";
import { shouldTranslateBlock } from "../../services/importServiceV2";
import {
  derivePaperReadiness,
  formatTranslationProgressLabel,
  translationPercent,
} from "../../domain/paperReadiness";
import {
  formatReadingProgress,
  readingProgressPercent,
} from "../../domain/readingProgress";
import {
  displayPaperTitle,
  usableTranslatedText,
  isGarbageTitle,
} from "../../services/translation/quality";
import { DraggablePaperArticle } from "./DraggablePaperArticle";
import styles from "./PaperCard.module.css";

type PaperCardProps = {
  paper: Paper;
  enabled?: boolean;
  onOpen: () => void;
  actions?: ReactNode;
};

function getStatusIcon(readiness: ReturnType<typeof derivePaperReadiness>["readiness"]) {
  if (readiness === "preparing" || readiness === "translating") {
    return <Loader2 size={16} className={styles.statusProcessing} />;
  }
  if (readiness === "readable") {
    return <CheckCircle size={16} className={styles.statusReady} />;
  }
  if (readiness === "needs_attention") {
    return <AlertCircle size={16} className={styles.statusFailed} />;
  }
  return <Clock size={16} className={styles.statusPending} />;
}

export function PaperCard({ paper, enabled = true, onOpen, actions }: PaperCardProps) {
  const blocks = useLibraryCache((state) => state.blocks[paper.id]);
  const view = derivePaperReadiness({
    processingStatus: paper.processingStatus,
    blocks,
  });
  const percent = translationPercent(blocks, (block) => shouldTranslateBlock(block));
  const progress = formatReadingProgress(readingProgressPercent(paper.lastReadBlockId, blocks));
  const statusLabel = formatTranslationProgressLabel(
    view.readiness,
    view.readiness === "translating" ? percent : null
  );

  return (
    <DraggablePaperArticle
      paperId={paper.id}
      label={displayPaperTitle(paper)}
      className={styles.card}
      enabled={enabled}
      onOpen={onOpen}
    >
      <div className={styles.icon}>
        <FileText size={24} strokeWidth={1.5} />
      </div>
      <div className={styles.info}>
        <h3 className={styles.title}>{displayPaperTitle(paper)}</h3>
        {usableTranslatedText(paper.titleTranslated, paper.titleOriginal) &&
          paper.titleOriginal &&
          !isGarbageTitle(paper.titleOriginal) && (
            <p className={styles.originalTitle}>{paper.titleOriginal}</p>
          )}
        {paper.authors.length > 0 && (
          <p className={styles.authors}>
            {paper.authors.slice(0, 3).join(", ")}
            {paper.authors.length > 3 && " ほか"}
          </p>
        )}
        <div className={styles.meta}>
          {progress && <span className={styles.date}>{progress}</span>}
          <span className={styles.status}>
            {getStatusIcon(view.readiness)}
            {statusLabel}
          </span>
        </div>
      </div>
      {actions}
    </DraggablePaperArticle>
  );
}
