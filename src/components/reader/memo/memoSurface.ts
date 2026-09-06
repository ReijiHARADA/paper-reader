import type { Annotation } from "../../../types/annotation";
import type { TranslationSelection } from "../selection/selectionAnchor";
import type { AnchorBox } from "./popoverPosition";

export type MemoSurface =
  | {
      mode: "compose";
      selection: TranslationSelection;
      note: string;
      error: string | null;
      saving: boolean;
      fallback: AnchorBox;
    }
  | {
      mode: "view";
      annotation: Annotation;
      fallback: AnchorBox;
    }
  | {
      mode: "edit";
      annotation: Annotation;
      note: string;
      error: string | null;
      saving: boolean;
      fallback: AnchorBox;
    }
  | {
      mode: "cross-block";
      fallback: AnchorBox;
    };

export function memoRange(surface: MemoSurface): {
  blockId?: string;
  startOffset?: number;
  endOffset?: number;
} {
  if (surface.mode === "compose") {
    return {
      blockId: surface.selection.blockId,
      startOffset: surface.selection.startOffset,
      endOffset: surface.selection.endOffset,
    };
  }
  if (surface.mode === "view" || surface.mode === "edit") {
    return {
      blockId: surface.annotation.blockId,
      startOffset: surface.annotation.startOffset,
      endOffset: surface.annotation.endOffset,
    };
  }
  return {};
}
