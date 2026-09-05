export type BlockKey = {
  paperId: string;
  blockId: string;
};

export function blockKey(paperId: string, blockId: string): BlockKey {
  return { paperId, blockId };
}

export function sameBlockKey(left: BlockKey, right: BlockKey): boolean {
  return left.paperId === right.paperId && left.blockId === right.blockId;
}
