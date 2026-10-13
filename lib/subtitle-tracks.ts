import { execFile, spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { PARTIAL_SUFFIX, PROGRESS_INTERVAL_MS } from "@/lib/fs-move";

const execFileAsync = promisify(execFile);

/**
 * Embedded subtitle tracks in these languages are kept; every other one is
 * removed when a movie is standardized. A track without a language tag is kept
 * too, since there is no telling what it is.
 */
export const KEPT_SUBTITLE_LANGUAGES = new Set([
  "pol",
  "pl",
  "polish",
  "eng",
  "en",
  "english",
]);

/** Containers ffmpeg can write back with every other stream copied unchanged. */
const MUXERS: Record<string, string> = {
  ".mkv": "matroska",
  ".mp4": "mp4",
  ".m4v": "mp4",
  ".mov": "mov",
  ".webm": "webm",
};

export interface ProbedStream {
  index: number;
  codecType: string;
  language: string | null;
}

export interface SubtitleStripResult {
  /** Subtitle tracks removed from the file. */
  removed: number;
  /** Subtitle tracks left in it. */
  kept: number;
}

function isKeptLanguage(language: string | null): boolean {
  if (!language || language === "und") return true;
  return KEPT_SUBTITLE_LANGUAGES.has(language.trim().toLowerCase());
}

/** Every stream of a file, with its type and language tag, via ffprobe. */
export async function probeStreams(filePath: string): Promise<ProbedStream[]> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=index,codec_type:stream_tags=language",
      "-of",
      "json",
      filePath,
    ],
    { timeout: 60000, maxBuffer: 16 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout) as {
    streams?: { index: number; codec_type?: string; tags?: { language?: string } }[];
  };
  return (parsed.streams ?? []).map((s) => ({
    index: s.index,
    codecType: s.codec_type ?? "",
    language: s.tags?.language ?? null,
  }));
}

/** Indexes of the subtitle streams to remove. */
export function subtitleStreamsToDrop(streams: ProbedStream[]): number[] {
  return streams
    .filter((s) => s.codecType === "subtitle" && !isKeptLanguage(s.language))
    .map((s) => s.index);
}

/** ffmpeg arguments that copy every stream except `dropIndexes` into `output`. */
export function buildStripArgs(
  input: string,
  output: string,
  muxer: string,
  dropIndexes: number[],
): string[] {
  return [
    "-nostdin",
    "-v",
    "error",
    "-y",
    "-i",
    input,
    "-map",
    "0",
    ...dropIndexes.flatMap((i) => ["-map", `-0:${i}`]),
    "-map_metadata",
    "0",
    "-map_chapters",
    "0",
    "-c",
    "copy",
    "-f",
    muxer,
    output,
  ];
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.trim()}`));
    });
  });
}

function countByType(streams: ProbedStream[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of streams) counts[s.codecType] = (counts[s.codecType] ?? 0) + 1;
  return counts;
}

/**
 * Remove the embedded subtitle tracks that aren't Polish or English, in place.
 *
 * Why: a media server that extracts embedded subtitles (to offer them as
 * separate files) typically runs one pass over the whole video per track, so a
 * release carrying dozens of subtitle languages makes it read the file dozens
 * of times. One stream copy here (no re-encoding) is much cheaper.
 *
 * The copy goes to `<file>.filmpick-partial` in the same folder and replaces
 * the original only after ffprobe confirms it has the same video and audio
 * streams and exactly the subtitle tracks that were meant to stay. On any
 * failure the original is left untouched and the partial file removed, so a
 * caller can treat this as best effort.
 */
export async function stripForeignSubtitleTracks(
  filePath: string,
  onProgress?: (bytesDone: number, bytesTotal: number) => void,
): Promise<SubtitleStripResult> {
  const muxer = MUXERS[path.extname(filePath).toLowerCase()];
  if (!muxer) return { removed: 0, kept: 0 };

  const streams = await probeStreams(filePath);
  const drop = subtitleStreamsToDrop(streams);
  const subtitleCount = streams.filter((s) => s.codecType === "subtitle").length;
  if (drop.length === 0) return { removed: 0, kept: subtitleCount };

  const partial = filePath + PARTIAL_SUFFIX;
  const bytesTotal = (await fs.stat(filePath)).size;
  const timer = onProgress
    ? setInterval(async () => {
        try {
          onProgress(Math.min((await fs.stat(partial)).size, bytesTotal), bytesTotal);
        } catch {
          // Not created yet.
        }
      }, PROGRESS_INTERVAL_MS)
    : null;

  try {
    await runFfmpeg(buildStripArgs(filePath, partial, muxer, drop));

    const expected = countByType(streams.filter((s) => !drop.includes(s.index)));
    const actual = countByType(await probeStreams(partial));
    const types = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const type of types) {
      if ((expected[type] ?? 0) !== (actual[type] ?? 0)) {
        throw new Error(
          `stream check failed for ${type}: expected ${expected[type] ?? 0}, got ${actual[type] ?? 0}`,
        );
      }
    }

    await fs.rename(partial, filePath);
  } catch (error) {
    await fs.rm(partial, { force: true });
    throw error;
  } finally {
    if (timer) clearInterval(timer);
  }

  return { removed: drop.length, kept: subtitleCount - drop.length };
}
