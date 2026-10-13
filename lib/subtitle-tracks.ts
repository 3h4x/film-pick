import { execFile, spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { PARTIAL_SUFFIX, PROGRESS_INTERVAL_MS } from "@/lib/fs-move";

const execFileAsync = promisify(execFile);

/** Setting holding the languages whose embedded subtitle tracks are kept. */
export const SUBTITLE_TRACK_LANGUAGES_SETTING = "subtitle_track_languages";

/**
 * Embedded subtitle tracks in these languages are kept when a movie is
 * standardized, unless Config sets others; every other one is removed. A track
 * without a language tag is always kept, since there is no telling what it is.
 * An empty list keeps every track (nothing is rewritten).
 */
export const DEFAULT_SUBTITLE_TRACK_LANGUAGES = ["pol", "eng"];

/**
 * Other ways files tag the same language: ISO 639-2/B and /T codes, ISO 639-1,
 * and the English name. The key is the code Config stores (ISO 639-2/B).
 */
const LANGUAGE_ALIASES: Record<string, string[]> = {
  pol: ["pl", "polish"],
  eng: ["en", "english"],
  ger: ["deu", "de", "german"],
  fre: ["fra", "fr", "french"],
  spa: ["es", "spanish"],
  ita: ["it", "italian"],
  por: ["pt", "portuguese"],
  rus: ["ru", "russian"],
  ukr: ["uk", "ukrainian"],
  cze: ["ces", "cs", "czech"],
  slo: ["slk", "sk", "slovak"],
  dut: ["nld", "nl", "dutch"],
  swe: ["sv", "swedish"],
  nor: ["nob", "nno", "no", "nb", "nn", "norwegian"],
  dan: ["da", "danish"],
  fin: ["fi", "finnish"],
  hun: ["hu", "hungarian"],
  rum: ["ron", "ro", "romanian"],
  gre: ["ell", "el", "greek"],
  tur: ["tr", "turkish"],
  jpn: ["ja", "japanese"],
  kor: ["ko", "korean"],
  chi: ["zho", "zh", "chinese"],
  ara: ["ar", "arabic"],
  heb: ["he", "hebrew"],
};

/** Every tag that counts as one of `languages` (codes as Config stores them). */
function acceptedTags(languages: string[]): Set<string> {
  const tags = new Set<string>();
  for (const code of languages) {
    const key = code.trim().toLowerCase();
    // Config may hold an alias (e.g. "deu"): find the entry it belongs to.
    const entry = Object.entries(LANGUAGE_ALIASES).find(
      ([main, aliases]) => main === key || aliases.includes(key),
    );
    tags.add(key);
    if (entry) {
      tags.add(entry[0]);
      for (const alias of entry[1]) tags.add(alias);
    }
  }
  return tags;
}

/**
 * Parse the setting: comma/space-separated language codes (2 or 3 letters),
 * lower-cased and de-duplicated. `null` = never set, so the default applies.
 */
export function parseSubtitleTrackLanguages(value: string | null | undefined): string[] {
  if (value === null || value === undefined) return [...DEFAULT_SUBTITLE_TRACK_LANGUAGES];
  return normalizeSubtitleTrackLanguages(value.split(/[\s,]+/));
}

/** Lower-cased, de-duplicated codes; throws on anything that isn't 2-3 letters. */
export function normalizeSubtitleTrackLanguages(codes: string[]): string[] {
  const out: string[] = [];
  for (const raw of codes) {
    const code = raw.trim().toLowerCase();
    if (!code) continue;
    if (!/^[a-z]{2,3}$/.test(code)) {
      throw new Error(`"${raw}" is not a 2- or 3-letter language code`);
    }
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

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

function isKeptLanguage(language: string | null, accepted: Set<string>): boolean {
  if (!language || language.trim().toLowerCase() === "und") return true;
  return accepted.has(language.trim().toLowerCase());
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

/** Indexes of the subtitle streams to remove; none when `languages` is empty. */
export function subtitleStreamsToDrop(
  streams: ProbedStream[],
  languages: string[],
): number[] {
  if (languages.length === 0) return [];
  const accepted = acceptedTags(languages);
  return streams
    .filter((s) => s.codecType === "subtitle" && !isKeptLanguage(s.language, accepted))
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
 * Remove the embedded subtitle tracks that aren't in `languages`, in place.
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
  languages: string[],
  onProgress?: (bytesDone: number, bytesTotal: number) => void,
): Promise<SubtitleStripResult> {
  const muxer = MUXERS[path.extname(filePath).toLowerCase()];
  if (!muxer || languages.length === 0) return { removed: 0, kept: 0 };

  const streams = await probeStreams(filePath);
  const drop = subtitleStreamsToDrop(streams, languages);
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
