import type { SelectionResult } from "./selectionAnchor";

export type SelectionNotesAction = "show-add-memo" | "show-cross-block" | "none";

/** Selection never opens Notes by itself. Highlight clicks are a separate path. */
export function selectionNotesAction(
  kind: SelectionResult["kind"] | undefined
): SelectionNotesAction {
  if (kind === "ok") return "show-add-memo";
  if (kind === "cross-block") return "show-cross-block";
  return "none";
}
