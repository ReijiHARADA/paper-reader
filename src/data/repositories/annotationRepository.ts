import type { Annotation } from "../../types/annotation";
import type { SqliteClient } from "../sqlite/client";

function rowToAnnotation(row: Record<string, unknown>): Annotation {
  return {
    id: String(row.id),
    paperId: String(row.paper_id),
    projectId: row.project_id == null ? null : String(row.project_id),
    blockId: String(row.block_id),
    startOffset: Number(row.start_offset),
    endOffset: Number(row.end_offset),
    selectedText: String(row.selected_text),
    prefixContext: String(row.prefix_context),
    suffixContext: String(row.suffix_context),
    translationTextHash: String(row.translation_text_hash),
    note: String(row.note),
    status: String(row.status) as Annotation["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function saveAnnotationRow(db: SqliteClient, annotation: Annotation): void {
  db.exec(
    `INSERT INTO annotations (
      id, paper_id, project_id, block_id, start_offset, end_offset, selected_text,
      prefix_context, suffix_context, translation_text_hash, note, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      paper_id=excluded.paper_id,
      project_id=excluded.project_id,
      block_id=excluded.block_id,
      start_offset=excluded.start_offset,
      end_offset=excluded.end_offset,
      selected_text=excluded.selected_text,
      prefix_context=excluded.prefix_context,
      suffix_context=excluded.suffix_context,
      translation_text_hash=excluded.translation_text_hash,
      note=excluded.note,
      status=excluded.status,
      updated_at=excluded.updated_at`,
    [
      annotation.id,
      annotation.paperId,
      annotation.projectId,
      annotation.blockId,
      annotation.startOffset,
      annotation.endOffset,
      annotation.selectedText,
      annotation.prefixContext,
      annotation.suffixContext,
      annotation.translationTextHash,
      annotation.note,
      annotation.status,
      annotation.createdAt,
      annotation.updatedAt,
    ]
  );
}

export function getAnnotationRow(db: SqliteClient, id: string): Annotation | undefined {
  const row = db.get("SELECT * FROM annotations WHERE id = ?", [id]);
  return row ? rowToAnnotation(row) : undefined;
}

export function listAnnotationsByPaper(db: SqliteClient, paperId: string): Annotation[] {
  return db.query("SELECT * FROM annotations WHERE paper_id = ?", [paperId]).map(rowToAnnotation);
}

export function listAnnotationsByBlock(db: SqliteClient, blockId: string): Annotation[] {
  return db.query("SELECT * FROM annotations WHERE block_id = ?", [blockId]).map(rowToAnnotation);
}

export function deleteAnnotationRow(db: SqliteClient, id: string): void {
  db.exec("DELETE FROM annotations WHERE id = ?", [id]);
}
