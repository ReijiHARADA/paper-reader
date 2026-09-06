import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Annotation } from "../../../types/annotation";
import type { TranslationSelection } from "../selection/selectionAnchor";
import {
  clampPopoverPosition,
  type AnchorBox,
} from "./popoverPosition";
import styles from "./MemoPopover.module.css";

export type MemoPopoverMode = "compose" | "view" | "edit" | "cross-block";

type MemoPopoverProps = {
  mode: MemoPopoverMode;
  anchor: AnchorBox;
  selection?: TranslationSelection | null;
  annotation?: Annotation | null;
  note: string;
  saving?: boolean;
  error?: string | null;
  onNoteChange: (note: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
};

export function MemoPopover({
  mode,
  anchor,
  selection,
  annotation,
  note,
  saving = false,
  error,
  onNoteChange,
  onSave,
  onCancel,
  onEdit,
  onDelete,
}: MemoPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [size, setSize] = useState({ width: 320, height: 180 });

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const update = () => {
      setSize({ width: el.offsetWidth, height: el.offsetHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [mode, note]);

  useEffect(() => {
    if (mode === "compose" || mode === "edit") {
      textareaRef.current?.focus();
    }
  }, [mode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-memo-popover]")) return;
      if (target?.closest("[data-annotation-mark]")) return;
      onCancel();
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [onCancel]);

  const placement = clampPopoverPosition(anchor, size);
  const quote = annotation?.selectedText || selection?.selectedText || "";
  const title =
    mode === "cross-block"
      ? "複数段落"
      : mode === "compose"
        ? "メモを追加"
        : "メモ";

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={title}
      data-memo-popover="true"
      className={styles.popover}
      style={{ top: placement.top, left: placement.left }}
    >
      {mode === "cross-block" ? (
        <p className={styles.message}>
          複数段落にまたがるメモには現在対応していません
        </p>
      ) : (
        <>
          {quote && <blockquote className={styles.quote}>“{quote}”</blockquote>}
          {annotation?.status === "orphaned" && (
            <p className={styles.orphaned}>
              元の翻訳文が変更されたため、現在の本文上で位置を特定できません。
            </p>
          )}
          {mode === "view" ? (
            <p className={styles.body}>{annotation?.note || "ハイライトのみ"}</p>
          ) : (
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              value={note}
              disabled={saving}
              placeholder="メモを入力…"
              aria-label="メモを入力"
              onChange={(event) => onNoteChange(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  onSave();
                }
              }}
            />
          )}
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            {mode === "view" ? (
              <>
                <button type="button" className={styles.ghost} onClick={onEdit}>
                  編集
                </button>
                <button type="button" className={styles.danger} onClick={onDelete}>
                  削除
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={onCancel}
                  disabled={saving}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={onSave}
                  disabled={saving}
                >
                  {saving ? "保存中…" : "保存"}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
