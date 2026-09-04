import type { PaperBlock, ProcessingStatus } from "../types/paper";

export function isBusyProcessingStatus(status: ProcessingStatus): boolean {
  return (
    status === "queued" ||
    status === "extracting" ||
    status === "structuring" ||
    status === "glossary" ||
    status === "translating"
  );
}

export function processingStatusLabel(status: ProcessingStatus): string {
  switch (status) {
    case "ready":
      return "翻訳完了";
    case "translating":
      return "翻訳中...";
    case "extracting":
      return "テキスト抽出中...";
    case "structuring":
      return "構造解析中...";
    case "glossary":
      return "用語集生成中...";
    case "partial":
      return "一部失敗";
    case "failed":
      return "処理失敗";
    default:
      return "処理待ち";
  }
}

export function finalizedTranslationStatus(
  blocks: PaperBlock[],
  isTranslatable: (block: PaperBlock) => boolean
): "ready" | "partial" {
  const failed = blocks.some(
    (block) => isTranslatable(block) && block.translationStatus === "failed"
  );
  return failed ? "partial" : "ready";
}
