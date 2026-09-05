import { isTauriApp } from "../utils/serverReady";
import { createIdbFileSystem } from "./fs/idbFs";
import { createMemoryFileSystem } from "./fs/memoryFs";
import { createTauriFileSystem } from "./fs/tauriFs";
import type { FileSystem } from "./fs/types";
import { resetDocumentCache } from "./repositories/documentRepository";
import { openSqlite, type SqliteClient } from "./sqlite/client";

export type StorageRuntime = {
  fs: FileSystem;
  db: SqliteClient;
};

let runtime: StorageRuntime | null = null;
let starting: Promise<StorageRuntime> | null = null;
let testFs: FileSystem | null = null;

export function setTestFileSystem(fs: FileSystem | null): void {
  testFs = fs;
  runtime = null;
  starting = null;
}

export async function getStorage(): Promise<StorageRuntime> {
  if (runtime) return runtime;
  if (!starting) {
    starting = (async () => {
      const fs =
        testFs ??
        (isTauriApp()
          ? createTauriFileSystem()
          : typeof window === "undefined"
            ? createMemoryFileSystem()
            : createIdbFileSystem());
      const db = await openSqlite(fs);
      runtime = { fs, db };
      return runtime;
    })();
  }
  return starting;
}

export async function resetStorageForTests(): Promise<void> {
  if (runtime) {
    try {
      await runtime.db.close();
    } catch {
      // ignore
    }
  }
  runtime = null;
  starting = null;
  testFs = createMemoryFileSystem();
  resetDocumentCache();
  const { resetDatabaseMigrationFlagForTests } = await import("../services/database");
  resetDatabaseMigrationFlagForTests();
}

export function peekStorage(): StorageRuntime | null {
  return runtime;
}
