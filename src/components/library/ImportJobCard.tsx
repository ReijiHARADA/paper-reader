import { AlertCircle, Loader2, RotateCcw, Trash2 } from "lucide-react";
import type { ImportJob } from "../../stores/importJobStore";
import styles from "./PaperCard.module.css";

type ImportJobCardProps = {
  job: ImportJob;
  onRetry?: (jobId: string) => void;
  onDismiss?: (jobId: string) => void;
};

export function ImportJobCard({ job, onRetry, onDismiss }: ImportJobCardProps) {
  const failed = job.stage === "failed";
  const percent =
    job.stageTotal > 0 ? Math.round((job.stageProgress / job.stageTotal) * 100) : 0;

  return (
    <article className={styles.row} aria-busy={!failed}>
      <div className={styles.info}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>{job.fileName}</h3>
        </div>
      </div>
      <div className={styles.trailing}>
        <span className={styles.status}>
          {failed ? (
            <AlertCircle size={14} className={styles.statusFailed} />
          ) : (
            <Loader2 size={14} className={styles.statusProcessing} />
          )}
          <span className={styles.statusLabel}>{failed ? "要確認" : "準備中"}</span>
        </span>
        {!failed && (
          <span className={styles.date}>{percent > 0 ? `${percent}%` : job.message}</span>
        )}
        {failed && <span className={styles.date}>{job.error ?? job.message}</span>}
        {failed && (
          <div className={styles.importActions}>
            <button
              type="button"
              className={styles.actionButton}
              title="再試行"
              aria-label="再試行"
              onClick={() => onRetry?.(job.id)}
            >
              <RotateCcw size={14} />
            </button>
            <button
              type="button"
              className={styles.actionButton}
              title="この項目を削除"
              aria-label="この項目を削除"
              onClick={() => onDismiss?.(job.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
