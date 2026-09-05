import { SQLITE_SCHEMA_VERSION } from "../schemaVersion";

export const SQLITE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS papers (
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
  package_revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS papers_by_hash ON papers(source_file_hash);
CREATE INDEX IF NOT EXISTS papers_by_updated ON papers(updated_at);

CREATE TABLE IF NOT EXISTS workspace_nodes (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  description TEXT,
  research_question TEXT,
  keywords_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS workspace_nodes_parent ON workspace_nodes(parent_id, sort_order);

CREATE TABLE IF NOT EXISTS workspace_papers (
  node_id TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  relevance REAL,
  status TEXT,
  decision TEXT,
  tags_json TEXT,
  quotes_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (node_id, paper_id),
  FOREIGN KEY (node_id) REFERENCES workspace_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS workspace_papers_by_paper ON workspace_papers(paper_id);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  workspace_node_id TEXT,
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
  updated_at TEXT NOT NULL,
  FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS annotations_by_paper ON annotations(paper_id);
CREATE INDEX IF NOT EXISTS annotations_by_block ON annotations(block_id);
CREATE INDEX IF NOT EXISTS annotations_by_paper_block ON annotations(paper_id, block_id);

CREATE TABLE IF NOT EXISTS reading_positions (
  paper_id TEXT PRIMARY KEY,
  block_id TEXT NOT NULL,
  offset REAL NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS glossaries (
  paper_id TEXT PRIMARY KEY,
  entries_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS translation_cache (
  text_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  model_version TEXT NOT NULL,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  cached_at INTEGER NOT NULL,
  PRIMARY KEY (text_hash, model, model_version, source_language, target_language)
);
CREATE INDEX IF NOT EXISTS translation_cache_by_model ON translation_cache(model);

CREATE TABLE IF NOT EXISTS translation_jobs (
  paper_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (paper_id, block_id),
  FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS benchmarks (
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
  timestamp TEXT NOT NULL,
  FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS benchmarks_by_paper ON benchmarks(paper_id);
CREATE INDEX IF NOT EXISTS benchmarks_by_model ON benchmarks(model);
CREATE INDEX IF NOT EXISTS benchmarks_by_timestamp ON benchmarks(timestamp);

`;

export const SQLITE_FTS5_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS papers_fts USING fts5(
  paper_id UNINDEXED,
  title,
  authors,
  original,
  translation,
  annotation
);
`;

export const SQLITE_FTS_FALLBACK_SQL = `
CREATE TABLE IF NOT EXISTS papers_fts (
  paper_id TEXT PRIMARY KEY,
  title TEXT,
  authors TEXT,
  original TEXT,
  translation TEXT,
  annotation TEXT
);
`;

export function sqliteSchemaVersionSql(version: number = SQLITE_SCHEMA_VERSION): string {
  return `INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '${version}');`;
}
