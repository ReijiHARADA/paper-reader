import { create } from "zustand";

export type PaperDropToast = {
  kind: "duplicate" | "added" | "error";
  message: string;
};

export const INBOX_DROP_ID = "inbox";
export const PROJECT_DROP_ATTR = "data-project-drop-id";
export const INBOX_DROP_ATTR = "data-inbox-drop";

export type PaperDropHandler = (
  targetId: string,
  paperId: string
) => void | Promise<void>;

type PaperDragState = {
  draggingPaperId: string | null;
  dragLabel: string;
  pointerX: number;
  pointerY: number;
  dropTargetId: string | null;
  toast: PaperDropToast | null;
  beginDrag: (paperId: string, label: string, x: number, y: number) => void;
  movePointer: (x: number, y: number, dropTargetId: string | null) => void;
  endDrag: () => void;
  showToast: (toast: PaperDropToast) => void;
  clearToast: () => void;
};

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let paperDropHandler: PaperDropHandler | null = null;

export function setPaperDropHandler(handler: PaperDropHandler | null): void {
  paperDropHandler = handler;
}

export function paperDropTargetAtPoint(x: number, y: number): string | null {
  const node = document.elementFromPoint(x, y);
  if (!(node instanceof Element)) return null;
  if (node.closest(`[${INBOX_DROP_ATTR}]`)) return INBOX_DROP_ID;
  return node.closest(`[${PROJECT_DROP_ATTR}]`)?.getAttribute(PROJECT_DROP_ATTR) ?? null;
}

export async function completePaperDrop(
  targetId: string,
  paperId: string
): Promise<void> {
  await paperDropHandler?.(targetId, paperId);
}

export const usePaperDragStore = create<PaperDragState>((set) => ({
  draggingPaperId: null,
  dragLabel: "",
  pointerX: 0,
  pointerY: 0,
  dropTargetId: null,
  toast: null,

  beginDrag: (paperId, label, x, y) => {
    document.body.classList.add("paper-dragging");
    set({
      draggingPaperId: paperId,
      dragLabel: label,
      pointerX: x,
      pointerY: y,
      dropTargetId: paperDropTargetAtPoint(x, y),
    });
  },

  movePointer: (x, y, dropTargetId) =>
    set({ pointerX: x, pointerY: y, dropTargetId }),

  endDrag: () => {
    document.body.classList.remove("paper-dragging");
    set({
      draggingPaperId: null,
      dragLabel: "",
      dropTargetId: null,
    });
  },

  showToast: (toast) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast });
    toastTimer = setTimeout(() => {
      set({ toast: null });
      toastTimer = undefined;
    }, 3200);
  },

  clearToast: () => {
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = undefined;
    set({ toast: null });
  },
}));
