export const WORKSPACE_HOVER_EXPAND_MS = 400;

/** A collapsed folder under the pointer should open so nested drop targets appear. */
export function hoverExpandId(
  hoverId: string | null | undefined,
  collapsed: Record<string, boolean>
): string | null {
  if (!hoverId || hoverId === "root" || hoverId === "inbox") return null;
  return collapsed[hoverId] ? hoverId : null;
}
