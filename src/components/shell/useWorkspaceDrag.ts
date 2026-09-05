import { useEffect, useRef, useState } from "react";
import type { WorkspaceNode } from "../../types/project";
import { assertMoveAllowed } from "../../data/workspace/tree";
import { listWorkspace, moveWorkspaceItem } from "../../services/projectService";
import { getAllProjectPapers } from "../../services/database";
import { useProjectStore } from "../../stores/projectStore";
import { showToast } from "../../stores/toastStore";

type Drop = { id: string; parentId: string | null; order?: number; edge: string; error?: string };

export function workspaceDropAtPoint(nodes: WorkspaceNode[], sourceId: string, x: number, y: number): Drop | null {
  const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-workspace-id]");
  if (!element) return null;
  const id = element.dataset.workspaceId!;
  if (id === "root") return { id, parentId: null, edge: "inside" };
  const target = nodes.find((node) => node.id === id);
  if (!target) return null;
  const rect = element.getBoundingClientRect();
  const fraction = (y - rect.top) / rect.height;
  const edge = fraction < 0.22 ? "before" : fraction > 0.78 ? "after" : "inside";
  const parentId = edge === "inside" ? id : target.parentId;
  const siblings = nodes.filter((node) => node.parentId === parentId && node.id !== sourceId)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const order = edge === "inside" ? undefined : siblings.findIndex((node) => node.id === id) + (edge === "after" ? 1 : 0);
  let error: string | undefined;
  try { assertMoveAllowed(nodes, sourceId, parentId); }
  catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  return { id, parentId, order, edge, error };
}

export function useWorkspaceDrag(nodes: WorkspaceNode[], onMoved: (id: string | null) => void) {
  const [drop, setDrop] = useState<Drop | null>(null);
  const [dragging, setDragging] = useState(false);
  const skipClick = useRef(false);
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => () => cleanup.current(), []);
  return {
    drop, dragging,
    onClickCapture: (event: React.MouseEvent) => {
      if (skipClick.current) { event.preventDefault(); event.stopPropagation(); skipClick.current = false; }
    },
    onPointerDown: (event: React.PointerEvent, id: string) => {
      skipClick.current = false;
      if (event.button !== 0 || (event.target as Element).closest("button")) return;
      cleanup.current();
      skipClick.current = false;
      const { clientX: x, clientY: y, pointerId } = event;
      let started = false;
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", key);
        document.body.style.cursor = "";
        setDragging(false); setDrop(null);
      };
      const move = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        if (!started && Math.hypot(e.clientX - x, e.clientY - y) < 8) return;
        started = true; skipClick.current = true; setDragging(true); e.preventDefault();
        const target = workspaceDropAtPoint(nodes, id, e.clientX, e.clientY);
        setDrop(target);
        document.body.style.cursor = target?.error || !target ? "not-allowed" : "grabbing";
      };
      const up = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        const target = started ? workspaceDropAtPoint(nodes, id, e.clientX, e.clientY) : null;
        stop();
        if (!target) return;
        if (target.error) { showToast({ kind: "error", message: target.error }); return; }
        void (async () => {
          try {
            await moveWorkspaceItem(id, target.parentId, target.order);
            const [updatedNodes, memberships] = await Promise.all([listWorkspace(), getAllProjectPapers()]);
            useProjectStore.getState().setWorkspaceNodes(updatedNodes);
            useProjectStore.getState().setMemberships(memberships);
            onMoved(target.parentId);
          } catch (cause) {
            showToast({ kind: "error", message: cause instanceof Error ? cause.message : "移動に失敗しました" });
          }
        })();
      };
      const cancel = () => stop();
      const key = (e: KeyboardEvent) => { if (e.key === "Escape") stop(); };
      cleanup.current = stop;
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("keydown", key);
    },
  };
}
