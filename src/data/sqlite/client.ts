import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import type { FileSystem } from "../fs/types";
import { persistMetrics } from "../package/persist";
import {
  SQLITE_FTS5_SQL,
  SQLITE_FTS_FALLBACK_SQL,
  SQLITE_SCHEMA_SQL,
  SQLITE_SCHEMA_VERSION_SQL,
} from "./schema";

export type SqlRow = Record<string, unknown>;

export type SqliteClient = {
  exec(sql: string, params?: unknown[]): void;
  query<T extends SqlRow = SqlRow>(sql: string, params?: unknown[]): T[];
  get<T extends SqlRow = SqlRow>(sql: string, params?: unknown[]): T | undefined;
  persist(): Promise<void>;
  exportBytes(): Uint8Array;
  close(): void;
  hasFts5: boolean;
};

const SQLITE_PATH = "library.sqlite";

let SQL: SqlJsStatic | null = null;

async function loadSql(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  if (typeof window === "undefined") {
    const moduleSpec = "node:" + "module";
    const fsSpec = "node:" + "fs";
    const { createRequire } = (await import(/* @vite-ignore */ moduleSpec)) as {
      createRequire: (url: string) => { resolve: (id: string) => string };
    };
    const { readFileSync } = (await import(/* @vite-ignore */ fsSpec)) as {
      readFileSync: (path: string) => Uint8Array;
    };
    const req = createRequire(import.meta.url);
    const wasmBinary = readFileSync(req.resolve("sql.js/dist/sql-wasm.wasm"));
    SQL = await initSqlJs({
      wasmBinary: wasmBinary.buffer.slice(
        wasmBinary.byteOffset,
        wasmBinary.byteOffset + wasmBinary.byteLength
      ) as ArrayBuffer,
    });
    return SQL;
  }
  SQL = await initSqlJs({
    locateFile: (file) => new URL(`../../../node_modules/sql.js/dist/${file}`, import.meta.url).href,
  });
  return SQL;
}

function bind(db: Database, sql: string, params: unknown[] = []): void {
  db.run(sql, params as never[]);
}

export async function openSqlite(fs: FileSystem): Promise<SqliteClient> {
  const engine = await loadSql();
  const existing = await fs.readBytes(SQLITE_PATH);
  const db = existing ? new engine.Database(existing) : new engine.Database();
  db.run(SQLITE_SCHEMA_SQL);
  let hasFts5 = false;
  try {
    db.run(SQLITE_FTS5_SQL);
    hasFts5 = true;
  } catch {
    db.run(SQLITE_FTS_FALLBACK_SQL);
  }
  db.run(SQLITE_SCHEMA_VERSION_SQL);

  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  const persistNow = async () => {
    persistMetrics.sqliteExports += 1;
    await fs.writeBytes(SQLITE_PATH, db.export());
  };

  const client: SqliteClient = {
    exec(sql, params = []) {
      bind(db, sql, params);
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        void persistNow();
      }, 3000);
    },
    query<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []) {
      const stmt = db.prepare(sql);
      stmt.bind(params as never[]);
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      stmt.free();
      return rows;
    },
    get<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []) {
      return client.query<T>(sql, params)[0];
    },
    async persist() {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      await persistNow();
    },
    exportBytes() {
      return db.export();
    },
    close() {
      if (persistTimer) clearTimeout(persistTimer);
      db.close();
    },
    hasFts5,
  };
  return client;
}
