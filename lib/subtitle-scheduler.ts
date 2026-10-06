import type Database from "better-sqlite3";
import fs from "fs/promises";
import { getSetting } from "@/lib/db";
import { fetchMovieSubtitles } from "@/lib/subtitle-download";
import { SETTLE_MS } from "@/lib/sync-postprocess";

// Polish subtitles often appear days or weeks after a release. Every hour a small
// batch of library films without subtitles is looked up again: never-checked
// films first, then "none found" ones a week after their last try, errors (provider
// down, share unmounted) a day after. Every attempt is recorded on the movie row,
// which the movie detail shows. Off when Config's "Download Polish subtitles" is off.
const DEFAULT_INTERVAL_HOURS = 1;
const FIRST_RUN_DELAY_MS = 3 * 60 * 1000;
export const NOT_FOUND_RETRY_DAYS = 7;
export const ERROR_RETRY_DAYS = 1;
/** Provider lookups per batch; films that already have subtitles cost none. */
export const MAX_QUERIES_PER_BATCH = 25;
/** Rows looked at per batch, so a library full of subtitled films is walked quickly. */
const SCAN_LIMIT = 500;
const DELAY_MS = 1000;

let activeTimer: ReturnType<typeof setInterval> | null = null;
let firstRunTimer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<SubtitleBatchResult> | null = null;
let shutdownHandlerInstalled = false;

export interface SubtitleBatchResult {
  checked: number;
  downloaded: number;
  queries: number;
  skipped: boolean;
}

export interface SubtitleBatchOptions {
  now?: () => number;
  delayMs?: number;
  maxQueries?: number;
}

interface DueRow {
  id: number;
  file_path: string;
}

/** Library films whose subtitles are due to be looked up (again), oldest first. */
export function dueSubtitleChecks(
  db: Database.Database,
  nowMs: number,
  limit = SCAN_LIMIT,
): DueRow[] {
  const nowS = Math.floor(nowMs / 1000);
  return db
    .prepare(
      `SELECT id, file_path FROM movies
       WHERE file_path IS NOT NULL AND file_path != ''
         AND (subtitles_checked_at IS NULL
           OR (subtitles_check_status = 'not_found' AND subtitles_checked_at < ?)
           OR (subtitles_check_status IN ('error', 'no_file') AND subtitles_checked_at < ?))
       ORDER BY subtitles_checked_at IS NOT NULL, subtitles_checked_at, id
       LIMIT ?`,
    )
    .all(nowS - NOT_FOUND_RETRY_DAYS * 86400, nowS - ERROR_RETRY_DAYS * 86400, limit) as DueRow[];
}

export async function runSubtitleBatch(
  db: Database.Database,
  { now = Date.now, delayMs = DELAY_MS, maxQueries = MAX_QUERIES_PER_BATCH }: SubtitleBatchOptions = {},
): Promise<SubtitleBatchResult> {
  const result: SubtitleBatchResult = { checked: 0, downloaded: 0, queries: 0, skipped: false };
  if (getSetting(db, "sync_auto_subtitles") === "false") {
    return { ...result, skipped: true };
  }
  for (const row of dueSubtitleChecks(db, now())) {
    if (result.queries >= maxQueries) break;
    // A file still being written (a download in progress) is left for later, unrecorded.
    const stat = await fs.stat(row.file_path).catch(() => null);
    if (stat && now() - stat.mtimeMs < SETTLE_MS) continue;

    const outcome = await fetchMovieSubtitles(db, row.id);
    result.checked++;
    if (!outcome) continue;
    if (outcome.status === "downloaded") result.downloaded++;
    const queried =
      outcome.status === "downloaded" || outcome.status === "not_found" || outcome.status === "error";
    if (queried) {
      result.queries++;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  if (result.downloaded > 0 || result.queries > 0) {
    console.log(
      `[subtitles] batch: ${result.checked} checked, ${result.queries} looked up, ${result.downloaded} downloaded`,
    );
  }
  return result;
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

/** Run one batch now; a batch already in progress is joined, not duplicated. */
export function runSubtitleBatchNow(db: Database.Database): Promise<SubtitleBatchResult> {
  if (running) return running;
  running = (async () => {
    try {
      return await runSubtitleBatch(db);
    } catch (err) {
      console.error("[subtitles] batch failed:", err);
      return { checked: 0, downloaded: 0, queries: 0, skipped: false };
    } finally {
      running = null;
    }
  })();
  return running;
}

export function rescheduleSubtitleJob(db: Database.Database): void {
  clearTimers();
  const intervalStr = getSetting(db, "subtitle_retry_interval_hours");
  const parsed = intervalStr ? Number(intervalStr) : DEFAULT_INTERVAL_HOURS;
  const hours = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_INTERVAL_HOURS;
  if (hours === 0) return;
  activeTimer = setInterval(() => {
    void runSubtitleBatchNow(db);
  }, hours * 60 * 60 * 1000);
  activeTimer.unref?.();
}

export function initSubtitleScheduler(db: Database.Database): void {
  rescheduleSubtitleJob(db);
  if (activeTimer !== null) {
    firstRunTimer = setTimeout(() => {
      firstRunTimer = null;
      void runSubtitleBatchNow(db);
    }, FIRST_RUN_DELAY_MS);
    firstRunTimer.unref?.();
  }
  if (!shutdownHandlerInstalled) {
    shutdownHandlerInstalled = true;
    process.once("SIGTERM", clearTimers);
  }
}
