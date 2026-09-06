import { AlertCircle, FileText, Loader2, RotateCcw, Trash2 } from "lucide-react";
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
    <article className={styles.card} aria-busy={!failed}>
      <div className={styles.icon}>
        <FileText size={24} strokeWidth={1.5} />
      </div>
      <div className={styles.info}>
        <h3 className={styles.title}>{job.fileName}</h3>
        <div className={styles.meta}>
          <span className={styles.status}>
            {failed ? (
              <AlertCircle size={16} className={styles.statusFailed} />
            ) : (
              <Loader2 size={16} className={styles.statusProcessing} />
            )}
            {failed ? "要確認" : "準備中"}
          </span>
          {!failed && <span className={styles.date}>{percent > 0 ? `${percent}%` : job.message}</span>}
          {failed && <span className={styles.date}>{job.error ?? job.message}</span>}
        </div>
      </div>
      {failed && (
        <div className={styles.importActions}>
          <button
            type="button"
            className={styles.actionButton}
            title="再試行"
            aria-label="再試行"
            onClick={() => onRetry?.(job.id)}
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            className={styles.actionButton}
            title="この項目を削除"
            aria-label="この項目を削除"
            onClick={() => onDismiss?.(job.id)}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </article>
  );
}
