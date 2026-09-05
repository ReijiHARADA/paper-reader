import { AlertCircle, FileText, Loader2 } from "lucide-react";
import type { ImportJob } from "../../stores/importJobStore";
import styles from "./PaperCard.module.css";

export function ImportJobCard({ job }: { job: ImportJob }) {
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
    </article>
  );
}
