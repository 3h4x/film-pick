import type Database from "better-sqlite3";
import { getMovieLocalized } from "@/lib/tmdb";

interface MissingRow {
  id: number;
  tmdb_id: number;
  title: string;
  pl_title: string | null;
  description: string | null;
}

export interface LocalizeResult {
  checked: number;
  updated: number;
  failed: number;
}

/**
 * Fill in Polish titles (and descriptions) that are otherwise only fetched when
 * a movie's detail view is opened. Library search matches `pl_title`, so a film
 * synced from disk was unfindable by its Polish name ("odyseja") until someone
 * opened it once.
 *
 * Rows with a file on disk go first. When TMDb has no Polish title, the original
 * title is stored instead so the row is not retried on every sync (the UI hides
 * a Polish title that equals the original one).
 */
export async function enrichMissingLocalizedTitles(
  db: Database.Database,
  {
    limit,
    delayMs = 150,
    onProgress,
  }: {
    limit: number;
    delayMs?: number;
    onProgress?: (current: number, total: number) => void;
  },
): Promise<LocalizeResult> {
  const rows = db
    .prepare(
      `SELECT id, tmdb_id, title, pl_title, description FROM movies
       WHERE tmdb_id IS NOT NULL AND tmdb_id > 0
         AND (pl_title IS NULL OR pl_title = '')
         AND (cda_url IS NULL OR genre IS NOT NULL)
       ORDER BY (file_path IS NOT NULL AND file_path != '') DESC, id DESC
       LIMIT ?`,
    )
    .all(limit) as MissingRow[];

  const update = db.prepare(
    "UPDATE movies SET pl_title = ?, description = COALESCE(NULLIF(description, ''), ?) WHERE id = ?",
  );
  const result: LocalizeResult = { checked: 0, updated: 0, failed: 0 };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (i > 0 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    onProgress?.(i + 1, rows.length);
    result.checked++;
    try {
      const localized = await getMovieLocalized(row.tmdb_id);
      update.run(localized.pl_title || row.title, localized.description, row.id);
      result.updated++;
    } catch (error) {
      // Leave the row untouched: a transient TMDb error should be retried next sync.
      console.error(`[Localize] tmdb ${row.tmdb_id} failed:`, error);
      result.failed++;
    }
  }
  return result;
}
