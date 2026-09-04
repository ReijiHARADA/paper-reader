import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { FileSystem } from "./types";

interface FsDB extends DBSchema {
  files: {
    key: string;
    value: { path: string; data: Uint8Array };
  };
}

const DB_NAME = "paper-reader-fs";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<FsDB>> | null = null;

function getDb(): Promise<IDBPDatabase<FsDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FsDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("files")) {
          db.createObjectStore("files", { keyPath: "path" });
        }
      },
    });
  }
  return dbPromise;
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

/**
 * Browser-only fallback that stores Paper Package files as blobs.
 * Production SoT is the real filesystem. This is not the legacy
 * papers/sections/blocks IndexedDB schema.
 */
export function createIdbFileSystem(): FileSystem {
  return {
    async readBytes(path) {
      const db = await getDb();
      const row = await db.get("files", normalize(path));
      return row?.data ?? null;
    },
    async writeBytes(path, data) {
      const db = await getDb();
      await db.put("files", { path: normalize(path), data });
    },
    async readText(path) {
      const bytes = await this.readBytes(path);
      return bytes ? new TextDecoder().decode(bytes) : null;
    },
    async writeText(path, text) {
      await this.writeBytes(path, new TextEncoder().encode(text));
    },
    async exists(path) {
      const key = normalize(path);
      const db = await getDb();
      if (await db.get("files", key)) return true;
      const all = await db.getAllKeys("files");
      const prefix = key.endsWith("/") ? key : `${key}/`;
      return all.some((name) => String(name).startsWith(prefix));
    },
    async remove(path) {
      const key = normalize(path);
      const db = await getDb();
      const tx = db.transaction("files", "readwrite");
      await tx.store.delete(key);
      const prefix = key.endsWith("/") ? key : `${key}/`;
      let cursor = await tx.store.openCursor();
      while (cursor) {
        if (String(cursor.key).startsWith(prefix)) {
          await cursor.delete();
        }
        cursor = await cursor.continue();
      }
      await tx.done;
    },
    async rename(from, to) {
      const source = normalize(from);
      const dest = normalize(to);
      const db = await getDb();
      const exact = await db.get("files", source);
      if (exact) {
        await db.put("files", { path: dest, data: exact.data });
        await db.delete("files", source);
        return;
      }
      const all = await db.getAll("files");
      const prefix = source.endsWith("/") ? source : `${source}/`;
      const destPrefix = dest.endsWith("/") ? dest : `${dest}/`;
      for (const row of all) {
        if (row.path === source || row.path.startsWith(prefix)) {
          const next = destPrefix + row.path.slice(prefix.length);
          await db.put("files", { path: next, data: row.data });
          await db.delete("files", row.path);
        }
      }
    },
    async list(prefix) {
      const key = normalize(prefix);
      const withSlash = key.endsWith("/") ? key : `${key}/`;
      const db = await getDb();
      const all = await db.getAllKeys("files");
      return all
        .map(String)
        .filter((name) => name === key || name.startsWith(withSlash))
        .sort();
    },
  };
}

export function resetIdbFileSystemForTests(): void {
  dbPromise = null;
}
