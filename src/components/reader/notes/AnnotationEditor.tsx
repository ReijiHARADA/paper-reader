import { useEffect, useRef } from "react";
import styles from "./AnnotationEditor.module.css";

type AnnotationEditorProps = {
  selectedText: string;
  note: string;
  orphaned?: boolean;
  onNoteChange: (note: string) => void;
  onSave: () => void;
};

export function AnnotationEditor({
  selectedText,
  note,
  orphaned = false,
  onNoteChange,
  onSave,
}: AnnotationEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className={styles.editor}>
      <blockquote className={styles.quote}>“{selectedText}”</blockquote>
      {orphaned && (
        <p className={styles.orphaned}>
          元の翻訳文が変更されたため、現在の本文上で位置を特定できません。
        </p>
      )}
      <textarea
        ref={ref}
        className={styles.textarea}
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder="メモを入力（空でもハイライトとして保存できます）"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onSave();
          }
        }}
      />
      <div className={styles.actions}>
        <button type="button" className={styles.save} onClick={onSave}>
          保存
        </button>
      </div>
    </div>
  );
}
