import {
  importPDFV2,
  type ImportCallbacks,
  type ImportConfig,
} from "../importServiceV2";
import { startBackgroundImport } from "./startBackgroundImport";

export async function importPaper(
  file: File,
  callbacks: ImportCallbacks,
  config?: ImportConfig
) {
  return importPDFV2(file, callbacks, config);
}

export { startBackgroundImport };
