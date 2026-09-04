import { useCallback, useEffect, useState } from "react";
import {
  readTranslationSelection,
  type SelectionResult,
} from "./selectionAnchor";

export function useTextSelection(
  rootRef: React.RefObject<HTMLElement | null>,
  enabled = true
) {
  const [result, setResult] = useState<SelectionResult | null>(null);

  const dismiss = useCallback(() => {
    setResult(null);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;

    const onMouseUp = () => {
      window.setTimeout(() => {
        const next = readTranslationSelection(window.getSelection());
        setResult(next.kind === "empty" ? null : next);
      }, 0);
    };

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-selection-menu]")) return;
      setResult(null);
    };

    root.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      root.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [rootRef, enabled]);

  return { result, dismiss };
}
