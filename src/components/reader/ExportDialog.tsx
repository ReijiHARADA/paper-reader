import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "./ExportDialog.module.css";

export type ExportDialogValues = {
  mode: "markdown" | "notion" | "verification";
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
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose, open]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            書き出す
          </h2>
          <button
            ref={closeButtonRef}
            className={styles.closeButton}
            onClick={onClose}
            disabled={busy}
            title="閉じる"
            aria-label="閉じる"
          >
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
            <label className={styles.option}>
              <input
                type="radio"
                name="export-mode"
                checked={mode === "notion"}
                onChange={() => setMode("notion")}
              />
              Notion インポート用 ZIP（Markdown + 画像）
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
            {mode === "notion"
              ? "Notion では「設定 → インポート → ZIP」を選び、この ZIP を読み込んでください。画像も一緒に追加されます。"
              : "OFF のときは失敗した段落を書き出しません。ON のときは訳を作らず、原文と失敗マークを残します。"}
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
                variant:
                  mode === "verification"
                    ? "verification"
                    : mode === "notion"
                      ? "clean"
                      : variant,
                includeFailedTranslations,
              })
            }
          >
            {busy ? "書き出し中..." : "書き出す"}
          </button>
        </div>
      </section>
    </div>
    , document.body
  );
}
