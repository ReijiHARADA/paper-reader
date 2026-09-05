import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createMemoryFileSystem } from "../../data/fs/memoryFs";
import { openSqlite } from "../../data/sqlite/client";
import {
  getCachedTranslationRow,
  saveTranslationCacheRow,
} from "../../data/repositories/settingsRepository";

async function v1LibraryBytes(): Promise<Uint8Array> {
  const req = createRequire(import.meta.url);
  const wasm = readFileSync(req.resolve("sql.js/dist/sql-wasm.wasm"));
  const SQL = await initSqlJs({
    wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer,
  });
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE papers (
      id TEXT PRIMARY KEY,
      source_file_hash TEXT NOT NULL,
      title_original TEXT,
      title_translated TEXT,
      authors_json TEXT NOT NULL DEFAULT '[]',
      publication TEXT,
      year INTEGER,
      page_count INTEGER NOT NULL DEFAULT 0,
      processing_status TEXT NOT NULL,
      favorite INTEGER NOT NULL DEFAULT 0,
      last_opened_at TEXT,
      last_read_block_id TEXT,
      last_read_offset REAL,
      source_file_name TEXT,
      source_stored_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE workspace_nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE project_papers (
      project_id TEXT NOT NULL,
      paper_id TEXT NOT NULL,
      note TEXT,
      relevance REAL,
      status TEXT,
      decision TEXT,
      tags_json TEXT,
      quotes_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, paper_id)
    );
    CREATE TABLE annotations (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL,
      project_id TEXT,
      block_id TEXT NOT NULL,
      start_offset INTEGER NOT NULL,
      end_offset INTEGER NOT NULL,
      selected_text TEXT NOT NULL,
      prefix_context TEXT NOT NULL,
      suffix_context TEXT NOT NULL,
      translation_text_hash TEXT NOT NULL,
      note TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE reading_positions (
      paper_id TEXT PRIMARY KEY,
      block_id TEXT NOT NULL,
      offset REAL NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE glossaries (
      paper_id TEXT PRIMARY KEY,
      entries_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE translation_cache (
      text_hash TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      model_version TEXT NOT NULL,
      source_language TEXT NOT NULL,
      target_language TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );
    CREATE TABLE translation_jobs (
      paper_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (paper_id, block_id)
    );
    CREATE TABLE benchmarks (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL,
      model TEXT NOT NULL,
      model_version TEXT NOT NULL,
      input_chars INTEGER NOT NULL,
      input_tokens INTEGER,
      output_chars INTEGER NOT NULL,
      translation_time_ms INTEGER NOT NULL,
      chars_per_sec REAL NOT NULL,
      tokens_per_sec REAL,
      timestamp TEXT NOT NULL
    );
    INSERT INTO meta (key, value) VALUES ('schema_version', '1');
    INSERT INTO papers (id, source_file_hash, authors_json, processing_status, created_at, updated_at)
      VALUES ('p1', 'hash-1', '[]', 'ready', 't', 't');
    INSERT INTO workspace_nodes VALUES ('project', NULL, 'project', 'Research', 0, 't', 't');
    INSERT INTO project_papers VALUES ('project', 'p1', 'keep note', 0.9, 'reading', 'adopt', '["tag"]', '["quote"]', 't', 't');
    INSERT INTO translation_cache VALUES ('abc', 'madlad', '3b', 'en', 'ja', '訳A', 1);
  `);
  const bytes = db.export();
  db.close();
  return bytes;
}

async function v4WorkspaceBytes(): Promise<Uint8Array> {
  const req = createRequire(import.meta.url); const wasm = readFileSync(req.resolve("sql.js/dist/sql-wasm.wasm"));
  const SQL = await initSqlJs({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer }); const db = new SQL.Database();
  db.run(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE workspace_nodes (id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL, name TEXT NOT NULL, sort_order INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE projects (id TEXT PRIMARY KEY, description TEXT, research_question TEXT, keywords_json TEXT);
    CREATE TABLE papers (id TEXT PRIMARY KEY, source_file_hash TEXT NOT NULL, authors_json TEXT NOT NULL DEFAULT '[]', processing_status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE project_papers (project_id TEXT NOT NULL, paper_id TEXT NOT NULL, folder_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0, note TEXT, relevance REAL, status TEXT, decision TEXT, tags_json TEXT, quotes_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(project_id, paper_id));
    CREATE TABLE annotations (id TEXT PRIMARY KEY, paper_id TEXT NOT NULL, project_id TEXT, block_id TEXT NOT NULL, start_offset INTEGER NOT NULL, end_offset INTEGER NOT NULL, selected_text TEXT NOT NULL, prefix_context TEXT NOT NULL, suffix_context TEXT NOT NULL, translation_text_hash TEXT NOT NULL, note TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO meta VALUES ('schema_version', '4');
    INSERT INTO workspace_nodes VALUES ('root', NULL, 'project', 'Research', 0, 't', 't'), ('child', 'root', 'folder', 'Related', 0, 't', 't');
    INSERT INTO projects VALUES ('root', 'desc', 'question', '["keyword"]');
    INSERT INTO annotations VALUES ('ann', 'a', 'root', 'block', 0, 1, 'x', '', '', 'h', 'note', 'active', 't', 't');
    INSERT INTO papers VALUES ('a', 'ha', '[]', 'ready', 't', 't'), ('b', 'hb', '[]', 'ready', 't', 't');
    INSERT INTO project_papers VALUES ('root', 'a', NULL, 2, 'root note', .5, 'reading', 'adopt', '["a"]', '["q"]', 't', 't'), ('root', 'b', 'child', 3, 'child note', .8, 'read', 'hold', '["b"]', '["z"]', 't', 't');`);
  const bytes = db.export(); db.close(); return bytes;
}

describe("SQLite schema migration", () => {
  it("migrates v4 projects, folders, metadata and direct paper placements into v5", async () => {
    const fs = createMemoryFileSystem(); await fs.writeBytes("library.sqlite", await v4WorkspaceBytes()); const db = await openSqlite(fs);
    expect(db.get("SELECT name, description, research_question, keywords_json FROM workspace_nodes WHERE id = 'root'")).toEqual({ name: "Research", description: "desc", research_question: "question", keywords_json: '["keyword"]' });
    expect(db.get("SELECT parent_id, name FROM workspace_nodes WHERE id = 'child'")).toEqual({ parent_id: "root", name: "Related" });
    expect(db.query("SELECT node_id, paper_id, sort_order, note, status, tags_json FROM workspace_papers ORDER BY paper_id")).toEqual([
      { node_id: "root", paper_id: "a", sort_order: 2, note: "root note", status: "reading", tags_json: '["a"]' },
      { node_id: "child", paper_id: "b", sort_order: 3, note: "child note", status: "read", tags_json: '["b"]' },
    ]);
    expect(db.get<{ workspace_node_id: string }>("SELECT workspace_node_id FROM annotations WHERE id = 'ann'")?.workspace_node_id).toBe("root");
    await db.close();
  });
  it("migrates v1 translation_cache to a composite primary key", async () => {
    const fs = createMemoryFileSystem();
    await fs.writeBytes("library.sqlite", await v1LibraryBytes());
    const db = await openSqlite(fs);
    expect(db.get<{ value: string }>("SELECT value FROM meta WHERE key = ?", ["schema_version"])?.value).toBe(
      "5"
    );
    expect(db.get("SELECT node_id, sort_order, note, status, tags_json FROM workspace_papers")).toEqual({
      node_id: "project", sort_order: 0, note: "keep note", status: "reading", tags_json: '["tag"]',
    });
    expect(db.get("SELECT title_original, source_file_hash FROM papers")?.source_file_hash).toBe("hash-1");
    expect(getCachedTranslationRow(db, "abc", "madlad", "3b", "en", "ja")).toBe("訳A");
    saveTranslationCacheRow(db, "abc", {
      model: "other",
      modelVersion: "1",
      sourceLanguage: "en",
      targetLanguage: "ja",
      translatedText: "訳B",
    });
    expect(getCachedTranslationRow(db, "abc", "madlad", "3b", "en", "ja")).toBe("訳A");
    expect(getCachedTranslationRow(db, "abc", "other", "1", "en", "ja")).toBe("訳B");
    expect(() =>
      db.exec(
        `INSERT INTO papers (
          id, source_file_hash, authors_json, processing_status, page_count, created_at, updated_at
        ) VALUES (?, ?, '[]', 'ready', 1, 't', 't')`,
        ["p2", "hash-1"]
      )
    ).toThrow();
    await db.close();
  });
});
