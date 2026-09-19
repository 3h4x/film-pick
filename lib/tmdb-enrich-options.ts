import type { RefreshStaleOptions } from "@/lib/tmdb-refresh";
import type { RematchOptions } from "@/lib/tmdb-rematch";

/**
 * How sync/import fill in TMDb data (Polish title, description, director,
 * writer, actors, collection...) after adding files: every movie that was never
 * refreshed or was last refreshed more than 30 days ago, a few requests in
 * parallel. `tmdb_refreshed_at` records what was done and when, so a movie
 * refreshed recently is skipped and repeated syncs stay cheap.
 */
/**
 * Films added without a TMDb match are searched for again (at most once per
 * `maxAgeDays`) before the refresh above, so a match found now gets its details in
 * the same sync.
 */
export const SYNC_REMATCH_OPTIONS: RematchOptions = {
  maxAgeDays: 30,
  concurrency: 4,
  delayMs: 50,
};

export const SYNC_ENRICH_OPTIONS: Omit<RefreshStaleOptions, "onProgress"> = {
  limit: 100_000,
  maxAgeDays: 30,
  delayMs: 50,
  concurrency: 4,
  // Sync must not undo hand edits: it fills what is empty and refreshes the rating.
  fillOnly: true,
};
