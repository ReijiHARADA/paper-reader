import { FileText } from "lucide-react";
import { usePaperDragStore } from "../../stores/paperDragStore";
import styles from "./AppShell.module.css";

export function PaperDragPreview() {
  const draggingPaperId = usePaperDragStore((state) => state.draggingPaperId);
  const dragLabel = usePaperDragStore((state) => state.dragLabel);
  const pointerX = usePaperDragStore((state) => state.pointerX);
  const pointerY = usePaperDragStore((state) => state.pointerY);

  if (!draggingPaperId) return null;

  return (
    <div
      className={styles.dragPreview}
      style={{ transform: `translate(${pointerX + 14}px, ${pointerY + 10}px)` }}
    >
      <FileText size={14} strokeWidth={1.8} />
      <span>{dragLabel || "論文"}</span>
    </div>
  );
}
