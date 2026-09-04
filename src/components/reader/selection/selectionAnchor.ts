export type TranslationSelection = {
  blockId: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
};

export type SelectionResult =
  | { kind: "ok"; selection: TranslationSelection; rect: DOMRect }
  | { kind: "cross-block"; rect: DOMRect }
  | { kind: "empty" };

function translationRoot(node: Node | null): HTMLElement | null {
  if (!node) return null;
  const el =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  return el?.closest("[data-text-role='translation']") as HTMLElement | null;
}

function rangeOffsetsInElement(
  element: HTMLElement,
  range: Range
): { start: number; end: number } {
  const pre = document.createRange();
  pre.selectNodeContents(element);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const selected = range.toString();
  return { start, end: start + selected.length };
}

export function readTranslationSelection(
  selection: Selection | null = typeof window !== "undefined"
    ? window.getSelection()
    : null
): SelectionResult {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return { kind: "empty" };
  }
  const range = selection.getRangeAt(0);
  const selectedText = range.toString();
  if (!selectedText.trim()) return { kind: "empty" };

  const startRoot = translationRoot(range.startContainer);
  const endRoot = translationRoot(range.endContainer);
  const rect = range.getBoundingClientRect();

  if (!startRoot || !endRoot) return { kind: "empty" };

  const startId = startRoot.dataset.paperBlockId;
  const endId = endRoot.dataset.paperBlockId;
  if (!startId || !endId) return { kind: "empty" };

  if (startId !== endId) {
    return { kind: "cross-block", rect };
  }

  const translated = startRoot.dataset.translatedText ?? startRoot.textContent ?? "";
  const { start, end } = rangeOffsetsInElement(startRoot, range);
  const clampedStart = Math.max(0, Math.min(translated.length, start));
  const clampedEnd = Math.max(clampedStart, Math.min(translated.length, end));
  const slice = translated.slice(clampedStart, clampedEnd);

  return {
    kind: "ok",
    rect,
    selection: {
      blockId: startId,
      startOffset: clampedStart,
      endOffset: clampedEnd,
      selectedText: slice || selectedText,
    },
  };
}
