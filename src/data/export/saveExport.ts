import { zipSync, strToU8 } from "fflate";
import { isTauriApp } from "../../utils/serverReady";
import type { MarkdownExportResult, VerificationExportResult } from "./markdownExport";

export type SavedExport = {
  kind: "markdown" | "verification";
  path: string;
};

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

function toBlobPart(bytes: Uint8Array): BlobPart {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function downloadBlob(fileName: string, bytes: Uint8Array, mime: string): void {
  const blob = new Blob([toBlobPart(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function assetDestPath(assetPath: string): string {
  return assetPath.startsWith("assets/") ? assetPath : `assets/${assetPath}`;
}

export async function saveMarkdownExport(result: MarkdownExportResult): Promise<SavedExport | null> {
  const fileName = `${result.fileName}.md`;
  const bytes = new TextEncoder().encode(result.markdown);
  if (isTauriApp()) {
    const path = await invoke<string | null>("pick_save_path", { defaultName: fileName });
    if (!path) return null;
    const dest = path.endsWith(".md") ? path : `${path}.md`;
    await invoke("write_user_file", { path: dest, data: Array.from(bytes) });
    const slash = dest.lastIndexOf("/");
    if (slash >= 0) {
      const destDir = dest.slice(0, slash);
      for (const asset of result.assets) {
        await invoke("write_user_file", {
          path: `${destDir}/${assetDestPath(asset.path)}`,
          data: Array.from(asset.bytes),
        });
      }
    }
    return { kind: "markdown", path: dest };
  }
  if (result.assets.length === 0) {
    downloadBlob(fileName, bytes, "text/markdown;charset=utf-8");
    return { kind: "markdown", path: fileName };
  }
  const files: Record<string, Uint8Array> = {
    [fileName]: strToU8(result.markdown),
  };
  for (const asset of result.assets) {
    files[assetDestPath(asset.path)] = asset.bytes;
  }
  downloadBlob(`${result.fileName}.zip`, zipSync(files), "application/zip");
  return { kind: "markdown", path: `${result.fileName}.zip` };
}

export async function saveVerificationExport(
  paperId: string,
  result: VerificationExportResult
): Promise<SavedExport | null> {
  if (isTauriApp()) {
    const folder = await invoke<string | null>("pick_directory", {});
    if (!folder) return null;
    const destRoot = `${folder.replace(/\/$/, "")}/${result.folderName}`;
    await invoke("write_user_file", {
      path: `${destRoot}/translated.md`,
      data: Array.from(new TextEncoder().encode(result.markdown)),
    });
    if (result.sourcePdf) {
      await invoke("copy_app_file_to_user", {
        relativePath: `papers/${paperId}/source.pdf`,
        destPath: `${destRoot}/source.pdf`,
      }).catch(async () => {
        await invoke("write_user_file", {
          path: `${destRoot}/source.pdf`,
          data: Array.from(result.sourcePdf ?? []),
        });
      });
    }
    for (const asset of result.assets) {
      const relative = asset.path.startsWith("assets/")
        ? `papers/${paperId}/${asset.path}`
        : `papers/${paperId}/assets/${asset.path}`;
      const destPath = `${destRoot}/${asset.path.startsWith("assets/") ? asset.path : `assets/${asset.path}`}`;
      await invoke("copy_app_file_to_user", {
        relativePath: relative,
        destPath,
      }).catch(async () => {
        await invoke("write_user_file", {
          path: destPath,
          data: Array.from(asset.bytes),
        });
      });
    }
    return { kind: "verification", path: destRoot };
  }

  const files: Record<string, Uint8Array> = {
    "translated.md": strToU8(result.markdown),
  };
  if (result.sourcePdf) files["source.pdf"] = result.sourcePdf;
  for (const asset of result.assets) {
    const path = asset.path.startsWith("assets/") ? asset.path : `assets/${asset.path}`;
    files[path] = asset.bytes;
  }
  const zipped = zipSync(files);
  downloadBlob(`${result.folderName}-verification.zip`, zipped, "application/zip");
  return { kind: "verification", path: `${result.folderName}-verification.zip` };
}
