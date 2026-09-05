import type { Paper } from "../../types/paper";
import { getPaperByHash } from "../database";

export async function findDuplicatePaper(fileHash: string): Promise<Paper | undefined> {
  return getPaperByHash(fileHash);
}
