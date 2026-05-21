// tamtam inspected 2026-05-21
import type { ScannedFile } from "@/lib/scanner";
import { cleanTitle } from "@/lib/utils";
import type Database from "better-sqlite3";

interface PathlessRow {
  id: number;
  title: string;
  year: number | null;
}

type PathlessRowTmdbMatch = {
  tmdb_id?: number | null;
} | null;

// Try to attach a scanned file to an existing pathless DB row before
// inserting a new one. Returns true if a row was linked.
//
// Match priority:
//   1. tmdb_id (when TMDb gave us one)
//   2. exact LOWER(title) + year IS ?
//   3. cleanTitle equality + year tolerance (±1)
export function linkToExistingPathlessRow(
  db: Database.Database,
  file: ScannedFile,
  tmdbMatch: PathlessRowTmdbMatch,
): boolean {
  const link = (id: number) => {
    db.prepare(
      "UPDATE movies SET file_path = ?, video_metadata = NULL, created_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(file.filePath, id);
  };

  if (tmdbMatch?.tmdb_id) {
    const byTmdb = db
      .prepare(
        "SELECT id FROM movies WHERE tmdb_id = ? AND (file_path IS NULL OR file_path = '')",
      )
      .get(tmdbMatch.tmdb_id) as { id: number } | undefined;
    if (byTmdb) {
      link(byTmdb.id);
      return true;
    }
  }

  const byTitleYear = db
    .prepare(
      "SELECT id FROM movies WHERE LOWER(title) = LOWER(?) AND year IS ? AND (file_path IS NULL OR file_path = '')",
    )
    .get(file.parsedTitle, file.parsedYear) as { id: number } | undefined;
  if (byTitleYear) {
    link(byTitleYear.id);
    return true;
  }

  const wantTitle = cleanTitle(file.parsedTitle).toLowerCase();
  if (!wantTitle) return false;

  const candidates = db
    .prepare(
      "SELECT id, title, year FROM movies WHERE file_path IS NULL OR file_path = ''",
    )
    .all() as PathlessRow[];

  for (const candidate of candidates) {
    if (cleanTitle(candidate.title).toLowerCase() !== wantTitle) continue;
    if (file.parsedYear != null && candidate.year != null) {
      if (Math.abs(candidate.year - file.parsedYear) > 1) continue;
    }
    link(candidate.id);
    return true;
  }

  return false;
}
