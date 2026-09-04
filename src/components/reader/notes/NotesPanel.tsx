import { useState } from "react";
import type { Annotation } from "../../../types/annotation";
import { AnnotationCard } from "./AnnotationCard";
import { AnnotationEditor } from "./AnnotationEditor";
import styles from "./NotesPanel.module.css";

type Draft = {
  selectedText: string;
  note: string;
};

type NotesPanelProps = {
  annotations: Annotation[];
  draft: Draft | null;
  editing: Annotation | null;
  activeIds: string[];
  undoLabel?: string | null;
  onDraftNoteChange: (note: string) => void;
  onSaveDraft: () => void;
  onEditNoteChange: (note: string) => void;
  onSaveEdit: () => void;
  onSelect: (annotation: Annotation) => void;
  onDelete: (annotation: Annotation) => void;
  onUndoDelete?: () => void;
  onClose: () => void;
};

export function NotesPanel({
  annotations,
  draft,
  editing,
  activeIds,
  undoLabel,
  onDraftNoteChange,
  onSaveDraft,
  onEditNoteChange,
  onSaveEdit,
  onSelect,
  onDelete,
  onUndoDelete,
  onClose,
}: NotesPanelProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <aside className={styles.panel} aria-label="Notes">
      <header className={styles.header}>
        <h2 className={styles.title}>Notes</h2>
        <button type="button" className={styles.close} onClick={onClose}>
          閉じる
        </button>
      </header>

      {undoLabel && onUndoDelete && (
        <div className={styles.undoBar}>
          <span>{undoLabel}</span>
          <button type="button" onClick={onUndoDelete}>
            元に戻す
          </button>
        </div>
      )}

      {draft && (
        <AnnotationEditor
          selectedText={draft.selectedText}
          note={draft.note}
          onNoteChange={onDraftNoteChange}
          onSave={onSaveDraft}
        />
      )}

      {editing && !draft && (
        <AnnotationEditor
          selectedText={editing.selectedText}
          note={editing.note}
          orphaned={editing.status === "orphaned"}
          onNoteChange={onEditNoteChange}
          onSave={onSaveEdit}
        />
      )}

      <div className={styles.list}>
        {annotations.length === 0 && !draft ? (
          <p className={styles.empty}>この論文のメモはまだありません</p>
        ) : (
          annotations.map((annotation) =>
            confirmId === annotation.id ? (
              <div key={annotation.id} className={styles.confirm}>
                <p>このメモを削除しますか？</p>
                <div>
                  <button type="button" onClick={() => setConfirmId(null)}>
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmId(null);
                      onDelete(annotation);
                    }}
                  >
                    削除する
                  </button>
                </div>
              </div>
            ) : (
              <AnnotationCard
                key={annotation.id}
                annotation={annotation}
                active={activeIds.includes(annotation.id)}
                onSelect={onSelect}
                onDelete={() => setConfirmId(annotation.id)}
              />
            )
          )
        )}
      </div>
    </aside>
  );
}
