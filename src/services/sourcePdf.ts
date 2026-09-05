import { isTauriApp } from "../utils/serverReady";
import type { BoundingBox } from "../types/paper";

export type OpenSourcePdfArgs = {
  paperId: string;
  page?: number;
  boundingBox?: BoundingBox;
};

function nativePath(file: File): string | undefined {
  const withPath = file as File & { path?: string };
  return typeof withPath.path === "string" && withPath.path.length > 0
    ? withPath.path
    : undefined;
}

/**
 * Copy the original PDF into Application Support.
 * Browser-only `npm run dev` cannot persist to the app data dir.
 */
export async function persistSourcePdf(
  paperId: string,
  file: File
): Promise<string | null> {
  if (!isTauriApp()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  const path = nativePath(file);
  if (path) {
    return invoke<string>("copy_source_pdf", {
      paperId,
      sourcePath: path,
    });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return invoke<string>("save_source_pdf", {
    paperId,
    data: Array.from(bytes),
  });
}

export async function openSourcePdf(args: OpenSourcePdfArgs): Promise<void> {
  if (!isTauriApp()) {
    throw new Error("元PDFはデスクトップアプリから開けます");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_source_pdf", {
    paperId: args.paperId,
    page: args.page ?? null,
  });
}

export async function deleteStoredSourcePdf(paperId: string): Promise<void> {
  if (!isTauriApp()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("delete_source_pdf", { paperId });
}

export async function sourcePdfExists(paperId: string): Promise<boolean> {
  try {
    const { getStorage } = await import("../data/runtime");
    const { fs } = await getStorage();
    if (await fs.exists(`papers/${paperId}/source.pdf`)) return true;
  } catch {
    // fall through to the Tauri command
  }
  if (!isTauriApp()) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("source_pdf_exists", { paperId });
}
