import type Database from "better-sqlite3";
import { getSetting } from "@/lib/db";
import { fillDismissedTitles, refreshStaleTmdbMetadata } from "@/lib/tmdb-refresh";
import { rematchLocalMovies } from "@/lib/tmdb-rematch";
import {
  BACKGROUND_ENRICH_OPTIONS,
  BACKGROUND_REMATCH_OPTIONS,
} from "@/lib/tmdb-enrich-options";

// The library's TMDb data (Polish title, credits, rating, runtime...) is kept
// fresh by small hourly batches instead of one long pass inside a sync, so a
// large backlog (a migration, a big import) works itself off over a day or two.
const DEFAULT_INTERVAL_HOURS = 1;
// Let the app finish starting (backup, dedup, other schedulers) before the first batch.
const FIRST_RUN_DELAY_MS = 2 * 60 * 1000;

let activeTimer: ReturnType<typeof setInterval> | null = null;
let firstRunTimer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<TmdbRefreshBatchResult> | null = null;
let shutdownHandlerInstalled = false;

export interface TmdbRefreshBatchResult {
  rematched: number;
  refreshed: number;
  skipped: boolean;
}

function clearTimers(): void {
  if (activeTimer !== null) {
    clearInterval(activeTimer);
    activeTimer = null;
  }
  if (firstRunTimer !== null) {
    clearTimeout(firstRunTimer);
    firstRunTimer = null;
  }
}

function hasTmdbKey(db: Database.Database): boolean {
  return Boolean(process.env.TMDB_API_KEY || getSetting(db, "tmdb_api_key"));
}

async function runBatch(db: Database.Database): Promise<TmdbRefreshBatchResult> {
  if (!hasTmdbKey(db)) return { rematched: 0, refreshed: 0, skipped: true };
  // Films without a TMDb id get a new search first, so a match found now is
  // refreshed in the same batch.
  const rematch = await rematchLocalMovies(db, BACKGROUND_REMATCH_OPTIONS);
  const refresh = await refreshStaleTmdbMetadata(db, BACKGROUND_ENRICH_OPTIONS);
  // Dismissals recorded before titles were stored (see the add_dismissed_titles migration).
  await fillDismissedTitles(db, { limit: 50, delayMs: BACKGROUND_ENRICH_OPTIONS.delayMs });
  if (rematch.matched > 0 || refresh.updated > 0) {
    console.log(
      `[tmdb-refresh] batch: ${rematch.matched} matched, ${refresh.updated} refreshed`,
    );
  }
  return { rematched: rematch.matched, refreshed: refresh.updated, skipped: false };
}

/** Run one batch now; a batch already in progress is joined, not duplicated. */
export function runTmdbRefreshNow(db: Database.Database): Promise<TmdbRefreshBatchResult> {
  if (running) return running;
  running = (async () => {
    try {
      return await runBatch(db);
    } catch (err) {
      console.error("[tmdb-refresh] batch failed:", err);
      return { rematched: 0, refreshed: 0, skipped: false };
    } finally {
      running = null;
    }
  })();
  return running;
}

export function rescheduleTmdbRefreshJob(db: Database.Database): void {
  clearTimers();

  const intervalStr = getSetting(db, "tmdb_refresh_interval_hours");
  const parsed = intervalStr ? Number(intervalStr) : DEFAULT_INTERVAL_HOURS;
  const hours = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_INTERVAL_HOURS;
  if (hours === 0) return;

  activeTimer = setInterval(() => {
    void runTmdbRefreshNow(db);
  }, hours * 60 * 60 * 1000);
  activeTimer.unref?.();
}

export function initTmdbRefreshScheduler(db: Database.Database): void {
  rescheduleTmdbRefreshJob(db);
  if (activeTimer !== null) {
    firstRunTimer = setTimeout(() => {
      firstRunTimer = null;
      void runTmdbRefreshNow(db);
    }, FIRST_RUN_DELAY_MS);
    firstRunTimer.unref?.();
  }
  if (!shutdownHandlerInstalled) {
    shutdownHandlerInstalled = true;
    process.once("SIGTERM", clearTimers);
  }
}
