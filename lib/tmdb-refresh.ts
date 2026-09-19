import type Database from "better-sqlite3";
import {
  getMovie,
  getStaleTmdbMovies,
  updateMovieTmdbMetadata,
  type Movie,
} from "@/lib/db";
import { getTmdbMovieSnapshot } from "@/lib/tmdb";

export interface RefreshMovieResult {
  movie: Movie;
  updated: boolean;
}

export async function refreshMovieTmdbMetadata(
  db: Database.Database,
  id: number,
  { fillOnly = false }: { fillOnly?: boolean } = {},
): Promise<RefreshMovieResult | null> {
  const existing = getMovie(db, id);
  if (!existing) return null;
  if (!existing.tmdb_id) {
    throw new Error("missing_tmdb_id");
  }
  if (existing.type !== "movie") {
    throw new Error("unsupported_tmdb_refresh_type");
  }

  const snapshot = await getTmdbMovieSnapshot(existing.tmdb_id);
  if (!snapshot) {
    throw new Error("tmdb_movie_not_found");
  }

  const movie = updateMovieTmdbMetadata(
    db,
    id,
    snapshot,
    Math.floor(Date.now() / 1000),
    { fillOnly },
  );
  if (!movie) return null;
  return { movie, updated: true };
}

export interface RefreshStaleOptions {
  limit: number;
  maxAgeDays: number;
  delayMs: number;
  /** Parallel TMDb requests. Defaults to 1 (sequential). */
  concurrency?: number;
  /** Only fill empty fields; never overwrite what is already stored (except the rating). */
  fillOnly?: boolean;
  /** Restrict the run to these movie ids (still only the never-refreshed / stale ones). */
  onlyIds?: number[];
  onProgress?: (current: number, total: number) => void;
}

export interface RefreshStaleResult {
  updated: number;
  skipped: number;
}

async function wait(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function refreshStaleTmdbMetadata(
  db: Database.Database,
  options: RefreshStaleOptions,
): Promise<RefreshStaleResult> {
  const cutoff = Math.floor(Date.now() / 1000) - options.maxAgeDays * 24 * 60 * 60;
  // Only never-refreshed rows and rows older than the cutoff: anything refreshed
  // recently is skipped, which is what makes repeated syncs cheap.
  const only = options.onlyIds ? new Set(options.onlyIds) : null;
  const rows = getStaleTmdbMovies(db, options.limit, cutoff).filter(
    (row) => !only || only.has(row.id),
  );
  const markRefreshed = db.prepare(
    "UPDATE movies SET tmdb_refreshed_at = ? WHERE id = ?",
  );
  let updated = 0;
  let skipped = 0;
  let done = 0;
  let next = 0;
  let fatal: unknown = null;

  async function worker() {
    while (fatal === null) {
      const row = rows[next++];
      if (!row) return;
      try {
        const result = await refreshMovieTmdbMetadata(db, row.id, {
          fillOnly: options.fillOnly,
        });
        if (result?.updated) {
          updated += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes("TMDB_API_KEY not set") || error.message.includes("tmdb_api_error"))
        ) {
          fatal = error;
          return;
        }
        if (error instanceof Error && error.message === "tmdb_movie_not_found") {
          // TMDb does not know this id (e.g. a CDA pseudo id). Record the attempt
          // so it is not asked again until the row goes stale.
          markRefreshed.run(Math.floor(Date.now() / 1000), row.id);
        }
        skipped += 1;
        if (error instanceof Error && error.message === "tmdb_movie_not_found") {
          console.warn(`[tmdb-refresh] movie ${row.id} (tmdb ${row.tmdb_id}) is not on TMDb`);
        } else {
          console.warn("[tmdb-refresh] Skipped movie refresh", {
            id: row.id,
            tmdbId: row.tmdb_id,
            error,
          });
        }
      }
      done += 1;
      options.onProgress?.(done, rows.length);
      await wait(options.delayMs);
    }
  }

  const workers = Math.max(1, Math.min(options.concurrency ?? 1, rows.length || 1));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  if (fatal !== null) throw fatal;

  return { updated, skipped };
}
