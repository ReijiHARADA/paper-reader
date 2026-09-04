import type { NavigateFunction } from "react-router-dom";
import { checkMADLADAvailability } from "./importServiceV2";
import { setPendingImportFile } from "./pendingImport";

export function isPdfFilename(name: string): boolean {
  return name.toLowerCase().split("?")[0].endsWith(".pdf");
}

export function isPdfFile(file: File): boolean {
  return file.type.includes("pdf") || isPdfFilename(file.name);
}

export function firstPdfPath(paths: string[]): string | null {
  return paths.find((path) => isPdfFilename(path)) ?? null;
}

export function importProjectIdFromLocation(
  pathname: string,
  search: string
): string | undefined {
  const match = pathname.match(/^\/project\/([^/]+)/);
  if (match?.[1]) return match[1];
  const fromQuery = new URLSearchParams(search).get("project");
  return fromQuery || undefined;
}

export async function fileFromDroppedPath(path: string): Promise<File> {
  const { invoke } = await import("@tauri-apps/api/core");
  const bytes = await invoke<number[] | Uint8Array>("read_dropped_pdf", { path });
  const name = path.split("/").pop() || "paper.pdf";
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const data = new Uint8Array(source.byteLength);
  data.set(source);
  const file = new File([data], name, {
    type: "application/pdf",
  });
  Object.defineProperty(file, "path", { value: path });
  return file;
}

export async function tryStartPdfImport(
  file: File,
  navigate: NavigateFunction,
  options?: { projectId?: string }
): Promise<boolean> {
  if (!isPdfFile(file)) {
    alert("PDFファイルのみ対応しています");
    return false;
  }
  const madladStatus = await checkMADLADAvailability();
  if (!madladStatus.available) {
    alert(
      "翻訳サーバーに接続できません。\ntranslation-server で `python server.py` を実行してください。"
    );
    return false;
  }
  setPendingImportFile(file, { projectId: options?.projectId });
  navigate("/import");
  return true;
}
