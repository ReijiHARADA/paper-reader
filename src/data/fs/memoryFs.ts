import type { FileSystem } from "./types";

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function createMemoryFileSystem(initial?: Record<string, Uint8Array | string>): FileSystem {
  const files = new Map<string, Uint8Array>();
  if (initial) {
    for (const [path, value] of Object.entries(initial)) {
      files.set(
        normalize(path),
        typeof value === "string" ? new TextEncoder().encode(value) : value
      );
    }
  }

  return {
    async readBytes(path) {
      return files.get(normalize(path)) ?? null;
    },
    async writeBytes(path, data) {
      files.set(normalize(path), data);
    },
    async readText(path) {
      const bytes = files.get(normalize(path));
      return bytes ? new TextDecoder().decode(bytes) : null;
    },
    async writeText(path, text) {
      files.set(normalize(path), new TextEncoder().encode(text));
    },
    async exists(path) {
      const key = normalize(path);
      if (files.has(key)) return true;
      const prefix = key.endsWith("/") ? key : `${key}/`;
      for (const name of files.keys()) {
        if (name.startsWith(prefix) || name === key) return true;
      }
      return false;
    },
    async remove(path) {
      const key = normalize(path);
      files.delete(key);
      const prefix = key.endsWith("/") ? key : `${key}/`;
      for (const name of [...files.keys()]) {
        if (name.startsWith(prefix)) files.delete(name);
      }
    },
    async rename(from, to) {
      const source = normalize(from);
      const dest = normalize(to);
      if (files.has(source)) {
        const data = files.get(source);
        if (data) files.set(dest, data);
        files.delete(source);
        return;
      }
      const prefix = source.endsWith("/") ? source : `${source}/`;
      const destPrefix = dest.endsWith("/") ? dest : `${dest}/`;
      for (const name of [...files.keys()]) {
        if (name === source || name.startsWith(prefix)) {
          const next = destPrefix + name.slice(prefix.length);
          const data = files.get(name);
          if (data) files.set(next, data);
          files.delete(name);
        }
      }
    },
    async list(prefix) {
      const key = normalize(prefix);
      const withSlash = key.endsWith("/") ? key : `${key}/`;
      return [...files.keys()]
        .filter((name) => name === key || name.startsWith(withSlash))
        .sort();
    },
  };
}
