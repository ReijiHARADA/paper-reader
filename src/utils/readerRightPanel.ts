export type ReaderRightPanel = "none" | "notes" | "glossary";

export function toggleReaderRightPanel(
  current: ReaderRightPanel,
  target: Exclude<ReaderRightPanel, "none">
): ReaderRightPanel {
  return current === target ? "none" : target;
}
