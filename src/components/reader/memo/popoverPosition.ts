export type AnchorBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type PopoverPlacement = {
  top: number;
  left: number;
};

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 180;
const GAP = 8;

export function rectToAnchor(rect: DOMRect | AnchorBox): AnchorBox {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

/** Keep a fixed popover near its anchor without leaving the viewport. */
export function clampPopoverPosition(
  anchor: AnchorBox,
  size: { width: number; height: number },
  viewport: { width: number; height: number } = {
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  },
  padding = 12
): PopoverPlacement {
  const width = size.width || DEFAULT_WIDTH;
  const height = size.height || DEFAULT_HEIGHT;
  const spaceBelow = viewport.height - (anchor.top + anchor.height) - padding;
  const placeBelow = spaceBelow >= height + GAP || anchor.top < height + GAP + padding;
  const top = placeBelow
    ? anchor.top + anchor.height + GAP
    : anchor.top - height - GAP;
  const center = anchor.left + anchor.width / 2;
  const left = center - width / 2;
  return {
    top: Math.min(
      Math.max(padding, top),
      Math.max(padding, viewport.height - height - padding)
    ),
    left: Math.min(
      Math.max(padding, left),
      Math.max(padding, viewport.width - width - padding)
    ),
  };
}

export function findTranslationRoot(blockId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-paper-block-id="${blockId}"][data-text-role="translation"]`
  );
}

export function measureOffsetsInElement(
  element: HTMLElement,
  startOffset: number,
  endOffset: number
): DOMRect | null {
  const start = Math.max(0, Math.min(startOffset, endOffset));
  const end = Math.max(start, endOffset);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let startNode: Text | null = null;
  let startOff = 0;
  let endNode: Text | null = null;
  let endOff = 0;
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    const length = text.data.length;
    const next = pos + length;
    if (!startNode && start <= next) {
      startNode = text;
      startOff = Math.max(0, start - pos);
    }
    if (!endNode && end <= next) {
      endNode = text;
      endOff = Math.max(0, end - pos);
      break;
    }
    pos = next;
    node = walker.nextNode();
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  try {
    range.setStart(startNode, Math.min(startOff, startNode.data.length));
    range.setEnd(endNode, Math.min(endOff, endNode.data.length));
  } catch {
    return null;
  }
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return rect;
}

export function measureMemoAnchor(input: {
  blockId?: string;
  startOffset?: number;
  endOffset?: number;
  fallback?: AnchorBox | null;
}): AnchorBox | null {
  if (
    input.blockId &&
    input.startOffset != null &&
    input.endOffset != null
  ) {
    const root = findTranslationRoot(input.blockId);
    if (root) {
      const measured = measureOffsetsInElement(root, input.startOffset, input.endOffset);
      if (measured) return rectToAnchor(measured);
    }
  }
  return input.fallback ?? null;
}
