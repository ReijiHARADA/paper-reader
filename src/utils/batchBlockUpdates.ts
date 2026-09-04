import type { PaperBlock } from "../types/paper";

export function createBlockUpdateBatcher(
  apply: (paperId: string, blocks: PaperBlock[]) => void
): {
  push: (block: PaperBlock) => void;
  flush: () => void;
} {
  const pending = new Map<string, Map<string, PaperBlock>>();
  let frame = 0;

  const flush = () => {
    if (frame && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(frame);
    }
    frame = 0;
    if (pending.size === 0) return;
    const snapshot = [...pending.entries()];
    pending.clear();
    for (const [paperId, blocks] of snapshot) {
      apply(paperId, [...blocks.values()]);
    }
  };

  return {
    push(block) {
      if (!block.paperId) return;
      let map = pending.get(block.paperId);
      if (!map) {
        map = new Map();
        pending.set(block.paperId, map);
      }
      map.set(block.id, block);
      if (typeof requestAnimationFrame !== "function") {
        flush();
        return;
      }
      if (frame) return;
      frame = requestAnimationFrame(flush);
    },
    flush,
  };
}
