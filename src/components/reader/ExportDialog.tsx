import { useState } from "react";
import { X } from "lucide-react";
import styles from "./ExportDialog.module.css";

export type ExportDialogValues = {
  mode: "markdown" | "verification";
  variant: "clean" | "verification";
  includeFailedTranslations: boolean;
};

type ExportDialogProps = {
  open: boolean;
  busy: boolean;
  status: string | null;
  error: string | null;
  onClose: () => void;
  onExport: (values: ExportDialogValues) => void;
};

export function ExportDialog({
  open,
  busy,
  status,
  error,
  onClose,
  onExport,
}: ExportDialogProps) {
  const [mode, setMode] = useState<ExportDialogValues["mode"]>("markdown");
  const [variant, setVariant] = useState<ExportDialogValues["variant"]>("clean");
  const [includeFailedTranslations, setIncludeFailedTranslations] = useState(false);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 id="export-dialog-title" className={styles.title}>
            書き出す
          </h2>
          <button className={styles.closeButton} onClick={onClose} disabled={busy} title="閉じる">
            <X size={18} />
          </button>
        </div>
        <div className={styles.body}>
          <fieldset className={styles.fieldset} disabled={busy}>
            <legend>種類</legend>
            <label className={styles.option}>
              <input
                type="radio"
                name="export-mode"
                checked={mode === "markdown"}
                onChange={() => setMode("markdown")}
              />
              Markdown
            </label>
            <label className={styles.option}>
              <input
                type="radio"
                name="export-mode"
                checked={mode === "verification"}
                onChange={() => setMode("verification")}
              />
              検証用パッケージ（source.pdf + translated.md + assets）
            </label>
          </fieldset>

          {mode === "markdown" && (
            <fieldset className={styles.fieldset} disabled={busy}>
              <legend>Markdown の形式</legend>
              <label className={styles.option}>
                <input
                  type="radio"
                  name="export-variant"
                  checked={variant === "clean"}
                  onChange={() => setVariant("clean")}
                />
                きれいな Markdown
              </label>
              <label className={styles.option}>
                <input
                  type="radio"
                  name="export-variant"
                  checked={variant === "verification"}
                  onChange={() => setVariant("verification")}
                />
                検証用（内部 block comment を残す）
              </label>
            </fieldset>
          )}

          <label className={styles.option}>
            <input
              type="checkbox"
              checked={includeFailedTranslations}
              disabled={busy}
              onChange={(event) => setIncludeFailedTranslations(event.target.checked)}
            />
            翻訳失敗箇所を含める
          </label>
          <p className={styles.hint}>
            OFF のときは失敗した段落を書き出しません。ON のときは訳を作らず、原文と失敗マークを残します。
          </p>

          {status && <p className={styles.status}>{status}</p>}
          {error && <p className={styles.error}>{error}</p>}
        </div>
        <div className={styles.actions}>
          <button className={styles.secondary} onClick={onClose} disabled={busy}>
            閉じる
          </button>
          <button
            className={styles.primary}
            disabled={busy}
            onClick={() =>
              onExport({
                mode,
                variant: mode === "verification" ? "verification" : variant,
                includeFailedTranslations,
              })
            }
          >
            {busy ? "書き出し中..." : "書き出す"}
          </button>
        </div>
      </div>
    </div>
  );
}
