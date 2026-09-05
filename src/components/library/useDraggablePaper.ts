import { useRef } from "react";
import {
  completePaperDrop,
  paperDropTargetAtPoint,
  usePaperDragStore,
} from "../../stores/paperDragStore";

const DRAG_THRESHOLD_PX = 8;

export function useDraggablePaper(
  paperId: string,
  label: string,
  enabled = true
) {
  const skipClick = useRef(false);
  const paperIdRef = useRef(paperId);
  const labelRef = useRef(label);
  const enabledRef = useRef(enabled);
  paperIdRef.current = paperId;
  labelRef.current = label;
  enabledRef.current = enabled;

  const beginDrag = usePaperDragStore((state) => state.beginDrag);
  const movePointer = usePaperDragStore((state) => state.movePointer);
  const endDrag = usePaperDragStore((state) => state.endDrag);

  return {
    onPointerDown: (event: React.PointerEvent) => {
      if (!enabledRef.current || event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button")) return;

      skipClick.current = false;
      const pointerId = event.pointerId;
      const originX = event.clientX;
      const originY = event.clientY;
      let dragging = false;

      const stop = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const dx = moveEvent.clientX - originX;
        const dy = moveEvent.clientY - originY;
        if (!dragging) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
          dragging = true;
          beginDrag(paperIdRef.current, labelRef.current, moveEvent.clientX, moveEvent.clientY);
        }
        moveEvent.preventDefault();
        movePointer(
          moveEvent.clientX,
          moveEvent.clientY,
          paperDropTargetAtPoint(moveEvent.clientX, moveEvent.clientY)
        );
      };

      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        stop();
        if (!dragging) return;
        skipClick.current = true;
        const targetId = paperDropTargetAtPoint(upEvent.clientX, upEvent.clientY);
        endDrag();
        if (targetId && upEvent.type !== "pointercancel") {
          void completePaperDrop(targetId, paperIdRef.current);
        }
      };

      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    consumeClickIfDragged: () => {
      if (!skipClick.current) return false;
      skipClick.current = false;
      return true;
    },
  };
}
