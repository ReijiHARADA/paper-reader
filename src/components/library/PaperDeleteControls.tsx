import type { MouseEvent } from "react";
import { Trash2 } from "lucide-react";
import styles from "./PaperCard.module.css";

type PaperDeleteControlsProps = {
  paperId: string;
  pendingId: string | null;
  error: string | null;
  busy: boolean;
  onRequest: (event: MouseEvent, paperId: string) => void;
  onConfirm: (event: MouseEvent, paperId: string) => void;
  onCancel: (event?: MouseEvent) => void;
};

export function PaperDeleteControls({
  paperId,
  pendingId,
  error,
  busy,
  onRequest,
  onConfirm,
  onCancel,
}: PaperDeleteControlsProps) {
  if (pendingId === paperId) {
    return (
      <div
        className={styles.deleteConfirm}
        onClick={(event) => event.stopPropagation()}
      >
        <p className={styles.deleteConfirmText}>
          {error ?? "翻訳データも削除します"}
        </p>
        <button
          type="button"
          className={styles.deleteConfirmYes}
          disabled={busy}
          onClick={(event) => onConfirm(event, paperId)}
        >
          {busy ? "削除中..." : "削除する"}
        </button>
        <button
          type="button"
          className={styles.deleteConfirmNo}
          disabled={busy}
          onClick={onCancel}
        >
          キャンセル
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={styles.actionButton}
      title="削除"
      onClick={(event) => onRequest(event, paperId)}
    >
      <Trash2 size={16} />
    </button>
  );
}
