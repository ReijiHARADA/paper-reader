import type { Annotation } from "../../../types/annotation";
import styles from "./AnnotationCard.module.css";

type AnnotationCardProps = {
  annotation: Annotation;
  active?: boolean;
  onSelect: (annotation: Annotation) => void;
  onDelete: (annotation: Annotation) => void;
};

export function AnnotationCard({
  annotation,
  active = false,
  onSelect,
  onDelete,
}: AnnotationCardProps) {
  return (
    <article
      className={`${styles.card} ${active ? styles.active : ""}`}
      onClick={() => onSelect(annotation)}
    >
      <div className={styles.cardHeader}>
        <p className={styles.quote}>“{annotation.selectedText}”</p>
        <button
          type="button"
          className={styles.delete}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(annotation);
          }}
        >
          削除
        </button>
      </div>
      {annotation.status === "orphaned" && (
        <p className={styles.orphaned}>
          元の翻訳文が変更されたため、現在の本文上で位置を特定できません。
        </p>
      )}
      {annotation.note ? (
        <p className={styles.note}>{annotation.note}</p>
      ) : (
        <p className={styles.emptyNote}>ハイライトのみ</p>
      )}
    </article>
  );
}
