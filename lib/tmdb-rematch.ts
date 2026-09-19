import type Database from "better-sqlite3";
import { searchTmdb } from "@/lib/tmdb";
import { selectTmdbSearchCandidates } from "@/lib/tmdb-match";

export interface RematchOptions {
  maxAgeDays: number;
  concurrency?: number;
  delayMs?: number;
  onProgress?: (current: number, total: number) => void;
}

export interface RematchResult {
  matched: number;
  unmatched: number;
  failed: number;
}

interface LocalRow {
  id: number;
  title: string;
  year: number | null;
}

/**
 * Try again to match films that were added without a TMDb id (`source = 'local'`):
 * TMDb may have added the film since, or the first search may have failed. Only a
 * strong match (same normalized title, plausible year) is applied, and never one
 * whose TMDb id another row already has (that would create a duplicate).
 *
 * `tmdb_matched_at` records each attempt, so a film TMDb does not know is asked
 * about at most once per `maxAgeDays`. A failed request is not recorded and is
 * retried next run. Details (Polish title, credits...) are filled afterwards by
 * the normal TMDb refresh, which now sees a tmdb_id.
 */
export async function rematchLocalMovies(
  db: Database.Database,
  options: RematchOptions,
): Promise<RematchResult> {
  const cutoff = Math.floor(Date.now() / 1000) - options.maxAgeDays * 24 * 60 * 60;
  const rows = db
    .prepare(
      `SELECT id, title, year FROM movies
       WHERE tmdb_id IS NULL AND type = 'movie' AND source = 'local'
         AND (tmdb_matched_at IS NULL OR tmdb_matched_at < ?)
         -- rows added by this very sync were just searched; give TMDb a day
         AND (created_at IS NULL OR created_at < datetime('now', '-1 day'))
       ORDER BY (file_path IS NOT NULL AND file_path != '') DESC, id DESC`,
    )
    .all(cutoff) as LocalRow[];

  const findByTmdbId = db.prepare("SELECT id FROM movies WHERE tmdb_id = ?");
  const applyMatch = db.prepare(
    `UPDATE movies SET tmdb_id = ?, title = ?, year = COALESCE(year, ?), source = 'tmdb'
     WHERE id = ? AND tmdb_id IS NULL`,
  );
  const markTried = db.prepare("UPDATE movies SET tmdb_matched_at = ? WHERE id = ?");
  const result: RematchResult = { matched: 0, unmatched: 0, failed: 0 };
  let next = 0;
  let done = 0;

  async function worker() {
    for (;;) {
      const row = rows[next++];
      if (!row) return;
      try {
        const results = await searchTmdb(row.title, row.year);
        const { strongMatch } = selectTmdbSearchCandidates(results, row.title, row.year);
        const taken = strongMatch ? findByTmdbId.get(strongMatch.tmdb_id) : undefined;
        if (strongMatch && !taken) {
          applyMatch.run(strongMatch.tmdb_id, strongMatch.title, strongMatch.year, row.id);
          result.matched++;
        } else {
          result.unmatched++;
        }
        markTried.run(Math.floor(Date.now() / 1000), row.id);
      } catch (error) {
        console.warn("[tmdb-rematch] search failed", { id: row.id, title: row.title, error });
        result.failed++;
      }
      done++;
      options.onProgress?.(done, rows.length);
      if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
    }
  }

  const workers = Math.max(1, Math.min(options.concurrency ?? 1, rows.length || 1));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return result;
}
