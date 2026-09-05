import { create } from "zustand";
import { showToast as showAppToast } from "./toastStore";

export type PaperDropToast = {
  kind: "duplicate" | "added" | "error";
  message: string;
};

export const INBOX_DROP_ID = "inbox";
export const PROJECT_DROP_ATTR = "data-project-drop-id";
export const INBOX_DROP_ATTR = "data-inbox-drop";

export type PaperDropHandler = (
  targetId: string,
  paperId: string,
  sourceNodeId: string | null
) => void | Promise<void>;

type PaperDragState = {
  draggingPaperId: string | null;
  sourceNodeId: string | null;
  dragLabel: string;
  pointerX: number;
  pointerY: number;
  dropTargetId: string | null;
  beginDrag: (paperId: string, label: string, x: number, y: number, sourceNodeId?: string) => void;
  movePointer: (x: number, y: number, dropTargetId: string | null) => void;
  endDrag: () => void;
  showToast: (toast: PaperDropToast) => void;
};

let paperDropHandler: PaperDropHandler | null = null;

export function setPaperDropHandler(handler: PaperDropHandler | null): void {
  paperDropHandler = handler;
}

export function paperDropTargetAtPoint(x: number, y: number): string | null {
  const node = document.elementFromPoint(x, y);
  if (!(node instanceof Element)) return null;
  if (node.closest("[data-paper-drop-invalid]")) return null;
  if (node.closest(`[${INBOX_DROP_ATTR}]`)) return INBOX_DROP_ID;
  return node.closest(`[${PROJECT_DROP_ATTR}]`)?.getAttribute(PROJECT_DROP_ATTR) ?? null;
}

export async function completePaperDrop(
  targetId: string,
  paperId: string,
  sourceNodeId: string | null
): Promise<void> {
  await paperDropHandler?.(targetId, paperId, sourceNodeId);
}

export const usePaperDragStore = create<PaperDragState>((set) => ({
  draggingPaperId: null,
  sourceNodeId: null,
  dragLabel: "",
  pointerX: 0,
  pointerY: 0,
  dropTargetId: null,

  beginDrag: (paperId, label, x, y, sourceNodeId) => {
    document.body.classList.add("paper-dragging");
    set({
      draggingPaperId: paperId,
      sourceNodeId: sourceNodeId ?? null,
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
      sourceNodeId: null,
      dragLabel: "",
      dropTargetId: null,
    });
  },

  showToast: (toast) => {
    showAppToast({
      kind: toast.kind === "added" ? "success" : toast.kind === "duplicate" ? "info" : "error",
      message: toast.message,
    });
  },
}));
