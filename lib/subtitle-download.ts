import type Database from "better-sqlite3";
import fs from "fs/promises";
import path from "path";
import {
  SUBTITLE_EXTENSIONS,
  isSubtitleAdCue,
  normalizeSubtitle,
} from "@/lib/subtitles";
import { probeFps } from "@/lib/ffprobe";
import { fetchNapiprojektSubtitle, napiprojektHash } from "@/lib/napiprojekt";
import {
  fetchOpenSubtitlesSubtitle,
  opensubtitlesHash,
} from "@/lib/opensubtitles";
import { getErrorMessage } from "@/lib/utils";

export type SubtitleProvider = "napiprojekt" | "opensubtitles";

export interface SubtitleDownloadTarget {
  filePath: string;
  imdbId?: string | null;
  tmdbId?: number | null;
  title?: string | null;
  year?: number | null;
}

export type SubtitleDownloadResult =
  | {
      status: "downloaded";
      provider: SubtitleProvider;
      /** False when matched by title/IMDb rather than by this file's hash — timing may be off. */
      hashMatch: boolean;
      fileName: string;
      path: string;
      format: string;
      converted: boolean;
      cueCount: number;
      /** Injected ad cues stripped from the download. */
      adCuesRemoved: number;
    }
  | { status: "exists"; existing: string[] }
  | { status: "not_found" }
  | { status: "no_file" }
  | { status: "error"; error: string };

/**
 * Subtitle files that belong to a video: same basename, optionally followed by
 * a suffix such as `.pl` (`Movie.pl.srt`). Mirrors what the player picks up.
 */
export async function findExistingSubtitles(filePath: string): Promise<string[]> {
  const movieDir = path.dirname(filePath);
  const baseName = path.basename(filePath, path.extname(filePath));
  const files = await fs.readdir(movieDir);
  return files
    .filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return (
        SUBTITLE_EXTENSIONS.includes(ext) &&
        path.basename(file, ext).startsWith(baseName)
      );
    })
    .map((file) => path.join(movieDir, file));
}

async function findSubtitle(
  target: SubtitleDownloadTarget,
): Promise<{ content: Buffer; provider: SubtitleProvider; hashMatch: boolean } | null> {
  // NapiProjekt first: the largest Polish catalogue, and only ever a hash match.
  // One provider failing (outage, quota) must not stop the other from trying.
  let lastError: unknown = null;
  try {
    const content = await fetchNapiprojektSubtitle(
      await napiprojektHash(target.filePath),
    );
    if (content) return { content, provider: "napiprojekt", hashMatch: true };
  } catch (error) {
    lastError = error;
    console.warn(
      `[Subtitles] NapiProjekt failed for ${target.filePath}: ${getErrorMessage(error)}`,
    );
  }

  try {
    const hit = await fetchOpenSubtitlesSubtitle({
      hash: await opensubtitlesHash(target.filePath),
      imdbId: target.imdbId,
      tmdbId: target.tmdbId,
      query: target.title,
      year: target.year,
    });
    if (hit) return { ...hit, provider: "opensubtitles" };
  } catch (error) {
    lastError = error;
    console.warn(
      `[Subtitles] OpenSubtitles failed for ${target.filePath}: ${getErrorMessage(error)}`,
    );
  }

  if (lastError) throw lastError;
  return null;
}

/**
 * Find Polish subtitles for a video and save them next to it as
 * `<video basename>.srt` (the same path a manual upload writes). Downloads go
 * through the same normalization as uploads: providers hand out MicroDVD in
 * `.srt` clothing, which players render as nothing until it is converted.
 */
export async function downloadSubtitle(
  target: SubtitleDownloadTarget,
  { replace = false }: { replace?: boolean } = {},
): Promise<SubtitleDownloadResult> {
  try {
    const stat = await fs.stat(target.filePath).catch(() => null);
    if (!stat?.isFile()) return { status: "no_file" };

    if (!replace) {
      const existing = await findExistingSubtitles(target.filePath);
      if (existing.length > 0) return { status: "exists", existing };
    }

    const found = await findSubtitle(target);
    if (!found) return { status: "not_found" };

    const fps = await probeFps(target.filePath);
    const normalized = normalizeSubtitle(found.content, {
      fps,
      fallbackExtension: ".srt",
      dropCue: isSubtitleAdCue,
    });
    const baseName = path.basename(
      target.filePath,
      path.extname(target.filePath),
    );
    const fileName = baseName + normalized.extension;
    const targetPath = path.join(path.dirname(target.filePath), fileName);
    await fs.writeFile(targetPath, normalized.content);

    console.log(
      `[Subtitles] ${found.provider}${found.hashMatch ? "" : " (title match)"} -> ${targetPath}: ` +
        `${normalized.format}${normalized.format === "microdvd" ? ` at ${fps.toFixed(3)} fps` : ""}, ${normalized.cueCount} cues` +
        (normalized.droppedCues ? `, ${normalized.droppedCues} ad cues removed` : ""),
    );

    return {
      status: "downloaded",
      provider: found.provider,
      hashMatch: found.hashMatch,
      fileName,
      path: targetPath,
      format: normalized.format,
      converted: normalized.converted,
      cueCount: normalized.cueCount,
      adCuesRemoved: normalized.droppedCues,
    };
  } catch (error) {
    return { status: "error", error: getErrorMessage(error) };
  }
}

export type BulkSubtitleEvent =
  | { type: "start"; total: number }
  | {
      type: "progress";
      index: number;
      total: number;
      movieId: number;
      title: string;
      result: SubtitleDownloadResult;
    }
  | {
      type: "done";
      downloaded: number;
      notFound: number;
      skipped: number;
      errors: number;
    };

interface BulkMovieRow {
  id: number;
  title: string;
  year: number | null;
  imdb_id: string | null;
  tmdb_id: number | null;
  file_path: string;
}

/**
 * Walk every library movie that has a local file and fetch subtitles for the
 * ones without any. Sequential on purpose: each lookup reads 10 MiB off what is
 * usually a NAS and hits free community APIs, so `delayMs` spaces out the calls.
 */
export async function downloadMissingSubtitles(
  db: Database.Database,
  onEvent: (event: BulkSubtitleEvent) => void,
  { delayMs = 1000 }: { delayMs?: number } = {},
): Promise<void> {
  const movies = db
    .prepare(
      `SELECT id, title, year, imdb_id, tmdb_id, file_path FROM movies
       WHERE file_path IS NOT NULL AND file_path != '' ORDER BY title`,
    )
    .all() as BulkMovieRow[];
  const totals = { downloaded: 0, notFound: 0, skipped: 0, errors: 0 };
  onEvent({ type: "start", total: movies.length });

  for (const [index, movie] of movies.entries()) {
    const result = await downloadSubtitle({
      filePath: movie.file_path,
      imdbId: movie.imdb_id,
      tmdbId: movie.tmdb_id,
      title: movie.title,
      year: movie.year,
    });
    if (result.status === "downloaded") totals.downloaded++;
    else if (result.status === "not_found") totals.notFound++;
    else if (result.status === "error") totals.errors++;
    else totals.skipped++;
    onEvent({
      type: "progress",
      index: index + 1,
      total: movies.length,
      movieId: movie.id,
      title: movie.title,
      result,
    });
    const queriedProviders =
      result.status === "downloaded" ||
      result.status === "not_found" ||
      result.status === "error";
    if (queriedProviders && delayMs > 0 && index < movies.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  onEvent({ type: "done", ...totals });
}
