import type { SqliteClient } from "./client";

export function rebuildPaperFts(
  db: SqliteClient,
  paperId: string,
  input: {
    title: string;
    authors: string;
    original: string;
    translation: string;
    annotation: string;
  }
): void {
  db.exec("DELETE FROM papers_fts WHERE paper_id = ?", [paperId]);
  db.exec(
    "INSERT INTO papers_fts (paper_id, title, authors, original, translation, annotation) VALUES (?, ?, ?, ?, ?, ?)",
    [paperId, input.title, input.authors, input.original, input.translation, input.annotation]
  );
}

export function searchPapersFts(db: SqliteClient, query: string): string[] {
  if (!query.trim()) return [];
  if (db.hasFts5) {
    return db
      .query<{ paper_id: string }>(
        "SELECT paper_id FROM papers_fts WHERE papers_fts MATCH ? LIMIT 50",
        [query]
      )
      .map((row) => row.paper_id);
  }
  const like = `%${query.replace(/%/g, "")}%`;
  return db
    .query<{ paper_id: string }>(
      `SELECT paper_id FROM papers_fts
       WHERE title LIKE ? OR authors LIKE ? OR original LIKE ? OR translation LIKE ? OR annotation LIKE ?
       LIMIT 50`,
      [like, like, like, like, like]
    )
    .map((row) => row.paper_id);
}
