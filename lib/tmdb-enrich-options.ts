import type { RefreshStaleOptions } from "@/lib/tmdb-refresh";

/**
 * How sync/import fill in TMDb data (Polish title, description, director,
 * writer, actors, collection...) after adding files: every movie that was never
 * refreshed or was last refreshed more than 30 days ago, a few requests in
 * parallel. `tmdb_refreshed_at` records what was done and when, so a movie
 * refreshed recently is skipped and repeated syncs stay cheap.
 */
export const SYNC_ENRICH_OPTIONS: Omit<RefreshStaleOptions, "onProgress"> = {
  limit: 100_000,
  maxAgeDays: 30,
  delayMs: 50,
  concurrency: 4,
};
