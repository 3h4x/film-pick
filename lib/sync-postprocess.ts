import type Database from "better-sqlite3";
import fs from "fs/promises";
import { getSetting } from "@/lib/db";
import { runStandardizeJob } from "@/lib/standardize";
import { fetchMovieSubtitles, type SubtitleDownloadResult } from "@/lib/subtitle-download";
import { getErrorMessage } from "@/lib/utils";

/** A file changed this recently may still be downloading; leave it for the next sync. */
export const SETTLE_MS = 10 * 60 * 1000;

export interface PostprocessOptions {
  onProgress?: (current: number, total: number, title: string) => void;
  /** Pause between subtitle lookups (free community APIs). */
  delayMs?: number;
  settleMs?: number;
  now?: () => number;
}

export interface PostprocessResult {
  processed: number;
  standardized: number;
  subtitles: number;
  /** Still being written (modified within `settleMs`); retried next sync. */
  waiting: number;
  failed: number;
}

interface PendingRow {
  id: number;
  title: string;
  type: string;
}

interface MovieFileRow {
  id: number;
  title: string;
  year: number | null;
  imdb_id: string | null;
  tmdb_id: number | null;
  file_path: string | null;
}

/** Mark rows whose file sync just added or linked as needing the post-processing pass. */
export function markFilesForPostprocess(db: Database.Database, filePaths: string[]): void {
  const reset = db.prepare("UPDATE movies SET sync_processed_at = NULL WHERE file_path = ?");
  db.transaction(() => {
    for (const filePath of filePaths) reset.run(filePath);
  })();
}

/**
 * For films that sync added (sync_processed_at IS NULL, with a file): move the
 * file into the standard `<Title> [<Year>]/<Title>.<ext>` layout, then fetch Polish
 * subtitles when it has none. Each step can be turned off in Config
 * (`sync_auto_standardize`, `sync_auto_subtitles`). A row is marked done even
 * when a step fails, so one bad file is not retried on every sync; the movie
 * detail's buttons remain for that.
 */
export async function postprocessNewFiles(
  db: Database.Database,
  { onProgress, delayMs = 1000, settleMs = SETTLE_MS, now = Date.now }: PostprocessOptions = {},
): Promise<PostprocessResult> {
  const standardizeOn = getSetting(db, "sync_auto_standardize") !== "false";
  const subtitlesOn = getSetting(db, "sync_auto_subtitles") !== "false";
  const result: PostprocessResult = { processed: 0, standardized: 0, subtitles: 0, waiting: 0, failed: 0 };

  const rows = db
    .prepare(
      `SELECT id, title, type FROM movies
       WHERE sync_processed_at IS NULL AND file_path IS NOT NULL AND file_path != ''
       ORDER BY id`,
    )
    .all() as PendingRow[];
  if (rows.length === 0) return result;

  const getRow = db.prepare(
    "SELECT id, title, year, imdb_id, tmdb_id, file_path FROM movies WHERE id = ?",
  );
  const markDone = db.prepare("UPDATE movies SET sync_processed_at = ? WHERE id = ?");

  for (const [index, row] of rows.entries()) {
    onProgress?.(index + 1, rows.length, row.title);
    const before = getRow.get(row.id) as MovieFileRow | undefined;
    if (!before?.file_path) continue;

    const stat = await fs.stat(before.file_path).catch(() => null);
    if (!stat) {
      // Gone again (or an unmounted share): nothing to do now, retry next sync.
      result.waiting++;
      continue;
    }
    if (now() - stat.mtimeMs < settleMs) {
      result.waiting++;
      continue;
    }

    let ok = true;
    if (standardizeOn && row.type === "movie") {
      const outcome = await runStandardizeJob(db, row.id);
      if (outcome && outcome.status < 400) {
        if (outcome.body.newPath || outcome.body.mergedId) result.standardized++;
      } else {
        ok = false;
        console.warn(
          `[Sync] standardize skipped for movie ${row.id}: ${outcome ? String(outcome.body.error ?? outcome.status) : "already moving"}`,
        );
      }
    }

    // Standardize may have moved the file, or merged this row into another one.
    const after = getRow.get(row.id) as MovieFileRow | undefined;
    if (subtitlesOn && after?.file_path) {
      let sub: SubtitleDownloadResult;
      try {
        sub = (await fetchMovieSubtitles(db, row.id)) ?? { status: "no_file" };
      } catch (error) {
        sub = { status: "error", error: getErrorMessage(error) };
      }
      if (sub.status === "downloaded") result.subtitles++;
      if (sub.status === "error") {
        ok = false;
        console.warn(`[Sync] subtitle download failed for movie ${row.id}: ${sub.error}`);
      }
      const queried = sub.status === "downloaded" || sub.status === "not_found" || sub.status === "error";
      if (queried && delayMs > 0 && index < rows.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    if (after) markDone.run(Math.floor(now() / 1000), row.id);
    result.processed++;
    if (!ok) result.failed++;
  }
  return result;
}
