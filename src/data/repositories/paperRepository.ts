import type { Paper } from "../../types/paper";
import { listAnnotationsByPaper } from "./annotationRepository";
import { rebuildPaperFts } from "../sqlite/fts";
import type { SqliteClient } from "../sqlite/client";

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToPaper(row: Record<string, unknown>): Paper {
  return {
    id: String(row.id),
    sourceFilePath: String(row.source_file_name ?? ""),
    sourceFileName: row.source_file_name ? String(row.source_file_name) : undefined,
    sourceStoredPath: row.source_stored_path ? String(row.source_stored_path) : null,
    sourceFileHash: String(row.source_file_hash),
    titleOriginal: row.title_original == null ? null : String(row.title_original),
    titleTranslated: row.title_translated == null ? null : String(row.title_translated),
    authors: parseJson<string[]>(row.authors_json, []),
    publication: row.publication == null ? null : String(row.publication),
    year: row.year == null ? null : Number(row.year),
    pageCount: Number(row.page_count ?? 0),
    processingStatus: String(row.processing_status) as Paper["processingStatus"],
    lastReadBlockId: row.last_read_block_id == null ? null : String(row.last_read_block_id),
    lastReadOffset: row.last_read_offset == null ? null : Number(row.last_read_offset),
    favorite: Number(row.favorite ?? 0) === 1,
    lastOpenedAt: row.last_opened_at ? String(row.last_opened_at) : undefined,
    packageRevision: Number(row.package_revision ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function upsertPaperIndex(db: SqliteClient, paper: Paper): void {
  db.exec(
    `INSERT INTO papers (
      id, source_file_hash, title_original, title_translated, authors_json,
      publication, year, page_count, processing_status, favorite, last_opened_at,
      last_read_block_id, last_read_offset, source_file_name, source_stored_path,
      package_revision, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source_file_hash=excluded.source_file_hash,
      title_original=excluded.title_original,
      title_translated=excluded.title_translated,
      authors_json=excluded.authors_json,
      publication=excluded.publication,
      year=excluded.year,
      page_count=excluded.page_count,
      processing_status=excluded.processing_status,
      favorite=excluded.favorite,
      last_opened_at=excluded.last_opened_at,
      last_read_block_id=excluded.last_read_block_id,
      last_read_offset=excluded.last_read_offset,
      source_file_name=excluded.source_file_name,
      source_stored_path=excluded.source_stored_path,
      package_revision=excluded.package_revision,
      updated_at=excluded.updated_at`,
    [
      paper.id,
      paper.sourceFileHash,
      paper.titleOriginal,
      paper.titleTranslated,
      JSON.stringify(paper.authors),
      paper.publication,
      paper.year,
      paper.pageCount,
      paper.processingStatus,
      paper.favorite ? 1 : 0,
      paper.lastOpenedAt ?? null,
      paper.lastReadBlockId,
      paper.lastReadOffset,
      paper.sourceFileName ?? paper.sourceFilePath,
      paper.sourceStoredPath ?? null,
      paper.packageRevision ?? 0,
      paper.createdAt,
      paper.updatedAt,
    ]
  );
}

export function getPaperIndex(db: SqliteClient, id: string): Paper | undefined {
  const row = db.get("SELECT * FROM papers WHERE id = ?", [id]);
  return row ? rowToPaper(row) : undefined;
}

export function getAllPaperIndexes(db: SqliteClient): Paper[] {
  return db.query("SELECT * FROM papers ORDER BY updated_at DESC").map(rowToPaper);
}

export function getPaperIndexByHash(db: SqliteClient, hash: string): Paper | undefined {
  const row = db.get("SELECT * FROM papers WHERE source_file_hash = ?", [hash]);
  return row ? rowToPaper(row) : undefined;
}

export function deletePaperIndex(db: SqliteClient, id: string): void {
  db.exec("DELETE FROM papers_fts WHERE paper_id = ?", [id]);
  db.exec("DELETE FROM papers WHERE id = ?", [id]);
  db.exec("DELETE FROM project_papers WHERE paper_id = ?", [id]);
  db.exec("DELETE FROM annotations WHERE paper_id = ?", [id]);
  db.exec("DELETE FROM reading_positions WHERE paper_id = ?", [id]);
  db.exec("DELETE FROM glossaries WHERE paper_id = ?", [id]);
  db.exec("DELETE FROM translation_jobs WHERE paper_id = ?", [id]);
  db.exec("DELETE FROM benchmarks WHERE paper_id = ?", [id]);
}

export function saveReadingPositionRow(
  db: SqliteClient,
  paperId: string,
  blockId: string,
  offset: number
): void {
  const now = new Date().toISOString();
  db.exec(
    `INSERT INTO reading_positions (paper_id, block_id, offset, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(paper_id) DO UPDATE SET block_id=excluded.block_id, offset=excluded.offset, updated_at=excluded.updated_at`,
    [paperId, blockId, offset, now]
  );
  db.exec(
    "UPDATE papers SET last_read_block_id = ?, last_read_offset = ?, updated_at = ? WHERE id = ?",
    [blockId, offset, now, paperId]
  );
}

export function rebuildPaperSearchIndex(
  db: SqliteClient,
  paper: Paper,
  original: string,
  translation: string
): void {
  const annotation = listAnnotationsByPaper(db, paper.id)
    .map((item) => [item.note, item.selectedText].filter(Boolean).join(" "))
    .join(" ");
  rebuildPaperFts(db, paper.id, {
    title: [paper.titleOriginal, paper.titleTranslated].filter(Boolean).join(" "),
    authors: paper.authors.join(" "),
    original,
    translation,
    annotation,
  });
}

export function indexPaperText(
  db: SqliteClient,
  paper: Paper,
  original: string,
  translation: string
): void {
  rebuildPaperSearchIndex(db, paper, original, translation);
}
