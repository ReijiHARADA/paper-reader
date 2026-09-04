import type { ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
} from "lucide-react";
import type { Paper } from "../../types/paper";
import { usePaperDataStore } from "../../stores/appStore";
import {
  processingStatusLabel,
  isBusyProcessingStatus,
  displayProcessingStatus,
} from "../../services/paperStatus";
import { isRetryableTranslationFailure } from "../../services/importServiceV2";
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

function getStatusIcon(status: Paper["processingStatus"]) {
  if (isBusyProcessingStatus(status)) {
    return <Loader2 size={16} className={styles.statusProcessing} />;
  }
  switch (status) {
    case "ready":
      return <CheckCircle size={16} className={styles.statusReady} />;
    case "partial":
    case "failed":
      return <AlertCircle size={16} className={styles.statusFailed} />;
    default:
      return <Clock size={16} className={styles.statusPending} />;
  }
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function PaperCard({ paper, enabled = true, onOpen, actions }: PaperCardProps) {
  const lastViewed = paper.lastOpenedAt ?? paper.updatedAt;
  const blocks = usePaperDataStore((state) => state.blocks[paper.id]);
  const status = displayProcessingStatus(
    paper.processingStatus,
    blocks,
    isRetryableTranslationFailure
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
          <span className={styles.status}>
            {getStatusIcon(status)}
            {processingStatusLabel(status)}
          </span>
          <span className={styles.date}>最終閲覧: {formatDate(lastViewed)}</span>
        </div>
      </div>
      {actions}
    </DraggablePaperArticle>
  );
}
