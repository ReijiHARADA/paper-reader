import type { FileSystem } from "./types";

function toBytes(data: number[] | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/**
 * App-data filesystem via Tauri commands.
 * Paths are relative to the app data directory.
 */
export function createTauriFileSystem(): FileSystem {
  async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke<T>(cmd, args);
  }

  return {
    async readBytes(path) {
      const data = await invoke<number[] | null>("read_app_file", { relativePath: path });
      return data ? toBytes(data) : null;
    },
    async writeBytes(path, data) {
      await invoke("write_app_file", { relativePath: path, data: Array.from(data) });
    },
    async readText(path) {
      const bytes = await this.readBytes(path);
      return bytes ? new TextDecoder().decode(bytes) : null;
    },
    async writeText(path, text) {
      await this.writeBytes(path, new TextEncoder().encode(text));
    },
    async exists(path) {
      return invoke<boolean>("app_file_exists", { relativePath: path });
    },
    async remove(path) {
      await invoke("remove_app_file", { relativePath: path });
    },
    async rename(from, to) {
      await invoke("rename_app_file", { from, to });
    },
    async list(prefix) {
      return invoke<string[]>("list_app_files", { prefix });
    },
  };
}
