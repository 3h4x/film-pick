import type { RefreshStaleOptions } from "@/lib/tmdb-refresh";
import type { RematchOptions } from "@/lib/tmdb-rematch";

/**
 * Sync and import fetch TMDb data (Polish title, description, credits,
 * collection, runtime...) only for the movies they just added, a few requests in
 * parallel, so new films are searchable right away. Everything else is kept fresh
 * by the hourly background batches below (`lib/tmdb-refresh-scheduler.ts`).
 */
export const SYNC_ENRICH_OPTIONS: Omit<RefreshStaleOptions, "onProgress" | "onlyIds"> = {
  limit: 100_000,
  maxAgeDays: 30,
  delayMs: 50,
  concurrency: 4,
  // Sync must not undo hand edits: it fills what is empty and refreshes the rating.
  fillOnly: true,
};

/**
 * One background batch: movies never refreshed or last refreshed over 30 days
 * ago, oldest first. 100 an hour works off a 3000-movie backlog in about a day
 * and a half while staying far below TMDb's rate limits.
 */
export const BACKGROUND_ENRICH_OPTIONS: Omit<RefreshStaleOptions, "onProgress"> = {
  limit: 100,
  maxAgeDays: 30,
  delayMs: 250,
  concurrency: 1,
  fillOnly: true,
};

/**
 * Films added without a TMDb match are searched for again, at most once per
 * `maxAgeDays` each, a few per batch.
 */
export const BACKGROUND_REMATCH_OPTIONS: RematchOptions = {
  limit: 20,
  maxAgeDays: 30,
  concurrency: 1,
  delayMs: 250,
};
