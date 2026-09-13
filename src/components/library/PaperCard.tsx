import type { ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  Star,
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
import { displayPaperTitle } from "../../services/translation/quality";
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
    return <Loader2 size={14} className={styles.statusProcessing} />;
  }
  if (readiness === "readable") {
    return <CheckCircle size={14} className={styles.statusReady} />;
  }
  if (readiness === "needs_attention") {
    return <AlertCircle size={14} className={styles.statusFailed} />;
  }
  return <Clock size={14} className={styles.statusPending} />;
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
      className={styles.row}
      enabled={enabled}
      onOpen={onOpen}
    >
      <div className={styles.info}>
        <div className={styles.titleRow}>
          {paper.favorite && (
            <span className={styles.favoriteMark} title="お気に入り" aria-label="お気に入り">
              <Star size={14} fill="currentColor" aria-hidden="true" />
            </span>
          )}
          <h3 className={styles.title}>{displayPaperTitle(paper)}</h3>
        </div>
      </div>
      <div className={styles.trailing}>
        {progress && <span className={styles.date}>{progress}</span>}
        <span className={styles.status}>
          {getStatusIcon(view.readiness)}
          <span className={styles.statusLabel}>{statusLabel}</span>
        </span>
        {actions}
      </div>
    </DraggablePaperArticle>
  );
}
