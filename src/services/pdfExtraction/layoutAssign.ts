import type { ExtractedTextItem } from "../pdfService";

export type VisualLayoutBox = {
  id: string;
  label: "title" | "paragraph" | "heading" | "figure" | "table" | "caption" | "formula" | "other";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

export type NativeAssignment = {
  boxId: string;
  label: VisualLayoutBox["label"];
  original: string;
  itemCount: number;
};

function itemCenter(item: ExtractedTextItem): { x: number; y: number } {
  return { x: item.x + item.width / 2, y: item.y + item.height / 2 };
}

function contains(box: VisualLayoutBox, x: number, y: number): boolean {
  return (
    x >= box.x &&
    x <= box.x + box.width &&
    y >= box.y &&
    y <= box.y + box.height
  );
}

/**
 * Visual models label regions. Native pdf.js strings stay the source of
 * `original` whenever a text item falls inside the box.
 */
export function assignNativeTextToBoxes(
  items: ExtractedTextItem[],
  boxes: VisualLayoutBox[]
): NativeAssignment[] {
  return boxes.map((box) => {
    const inside = items.filter((item) => {
      if (item.page !== box.page) return false;
      const { x, y } = itemCenter(item);
      return contains(box, x, y);
    });
    return {
      boxId: box.id,
      label: box.label,
      original: inside
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
      itemCount: inside.length,
    };
  });
}
