import type { SelectionResult } from "./selectionAnchor";

export type SelectionNotesAction = "show-compose" | "show-cross-block" | "none";

/** Selection never opens Notes. Compose / highlight review stay on the page. */
export function selectionNotesAction(
  kind: SelectionResult["kind"] | undefined
): SelectionNotesAction {
  if (kind === "ok") return "show-compose";
  if (kind === "cross-block") return "show-cross-block";
  return "none";
}

export function bodyMemoOpensNotesInspector(): false {
  return false;
}
