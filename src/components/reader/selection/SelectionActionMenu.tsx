import type { TranslationSelection } from "./selectionAnchor";
import styles from "./SelectionActionMenu.module.css";

type SelectionActionMenuProps = {
  rect: DOMRect;
  selection: TranslationSelection | null;
  crossBlock?: boolean;
  onAddMemo: (selection: TranslationSelection) => void;
};

export function SelectionActionMenu({
  rect,
  selection,
  crossBlock = false,
  onAddMemo,
}: SelectionActionMenuProps) {
  const top = rect.bottom + 8;
  const left = Math.min(
    Math.max(12, rect.left + rect.width / 2),
    window.innerWidth - 12
  );

  return (
    <div
      data-selection-menu="true"
      className={styles.menu}
      style={{ top, left }}
    >
      {crossBlock ? (
        <p className={styles.message}>
          複数段落にまたがるメモには現在対応していません
        </p>
      ) : (
        <button
          type="button"
          className={styles.button}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (selection) onAddMemo(selection);
          }}
        >
          メモを追加
        </button>
      )}
    </div>
  );
}
