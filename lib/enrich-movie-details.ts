import type Database from "better-sqlite3";
import { getMovieLocalized, getTmdbMovieDetails } from "@/lib/tmdb";

interface MissingRow {
  id: number;
  tmdb_id: number;
  title: string;
  pl_title: string | null;
  description: string | null;
  tmdb_collection_checked: number | null;
  tmdb_collection_id: number | null;
  tmdb_collection_name: string | null;
}

export interface EnrichResult {
  checked: number;
  updated: number;
  failed: number;
}

/**
 * Fill in what library search matches on but TMDb's search endpoint does not
 * return: Polish title, description, director, writer, actors (and the
 * collection, from the same call). Until now these were only fetched when a
 * movie's detail view was opened, so a film freshly synced from disk was
 * unfindable by "odyseja" or "Nolan" until someone opened it once.
 *
 * Rows with a file on disk go first. `tmdb_collection_checked` doubles as the
 * "credits were fetched" marker (it is set by the same details call), so a film
 * TMDb has no credits for is not retried on every run. When TMDb has no Polish
 * title the original is stored for the same reason (the UI hides a Polish title
 * equal to the original). A transient TMDb error leaves that part untouched so
 * the next run retries it.
 */
export async function enrichMissingMovieDetails(
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
): Promise<EnrichResult> {
  const rows = db
    .prepare(
      `SELECT id, tmdb_id, title, pl_title, description,
              tmdb_collection_checked, tmdb_collection_id, tmdb_collection_name
       FROM movies
       WHERE tmdb_id IS NOT NULL AND tmdb_id > 0
         AND ((pl_title IS NULL OR pl_title = '')
              OR COALESCE(tmdb_collection_checked, 0) = 0)
         AND (cda_url IS NULL OR genre IS NOT NULL)
       ORDER BY (file_path IS NOT NULL AND file_path != '') DESC, id DESC
       LIMIT ?`,
    )
    .all(limit) as MissingRow[];

  const result: EnrichResult = { checked: 0, updated: 0, failed: 0 };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (i > 0 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    onProgress?.(i + 1, rows.length);
    result.checked++;

    const sets: string[] = [];
    const vals: (string | number | null)[] = [];
    let failed = false;

    if (!row.pl_title) {
      try {
        const localized = await getMovieLocalized(row.tmdb_id);
        sets.push("pl_title = ?");
        vals.push(localized.pl_title || row.title);
        if (localized.description && !row.description) {
          sets.push("description = ?");
          vals.push(localized.description);
        }
      } catch (error) {
        console.error(`[Enrich] localized ${row.tmdb_id} failed:`, error);
        failed = true;
      }
    }

    if (!row.tmdb_collection_checked) {
      try {
        const details = await getTmdbMovieDetails(row.tmdb_id);
        if (details.director || details.writer || details.actors) {
          sets.push("director = ?", "writer = ?", "actors = ?");
          vals.push(details.director, details.writer, details.actors);
        }
        if (details.tmdb_collection_id && !row.tmdb_collection_id) {
          sets.push("tmdb_collection_id = ?");
          vals.push(details.tmdb_collection_id);
        }
        if (details.tmdb_collection_name && !row.tmdb_collection_name) {
          sets.push("tmdb_collection_name = ?");
          vals.push(details.tmdb_collection_name);
        }
        // Only set when TMDb actually answered (a failed response has no flag).
        if (details.tmdb_collection_checked) {
          sets.push("tmdb_collection_checked = ?");
          vals.push(1);
        }
      } catch (error) {
        console.error(`[Enrich] details ${row.tmdb_id} failed:`, error);
        failed = true;
      }
    }

    if (sets.length > 0) {
      db.prepare(`UPDATE movies SET ${sets.join(", ")} WHERE id = ?`).run(
        ...vals,
        row.id,
      );
      result.updated++;
    }
    if (failed) result.failed++;
  }
  return result;
}
