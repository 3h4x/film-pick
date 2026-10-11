/**
 * Which way a library file can reach the embedded <video> player.
 *
 * Browsers decode only a few formats: H.264/HEVC/VP9/AV1 video, AAC/MP3/Opus audio,
 * in MP4/WebM (Chromium also plays Matroska). Anything else either fails to load at all
 * (AVI with MPEG-4 Part 2, the usual Xvid/DivX rip) or plays silently (AC-3, E-AC-3 or DTS
 * audio). The plan is read from the ffprobe metadata already stored on the movie, so
 * the player can say so up front instead of showing a black frame:
 *
 * - "direct": stream the file as is (Range requests, native seeking).
 * - "remux": ffmpeg copies the video stream unchanged and re-encodes only the audio to
 *   AAC into fragmented MP4. Cheap (no video encoding), but the stream has no Range
 *   support, so seeking restarts it from an offset (`start`).
 * - "unsupported": the video codec itself would need a full re-encode, which a small
 *   home server cannot do in real time. VLC plays these.
 */

export type PlaybackMode = "direct" | "remux" | "unsupported";

export interface PlaybackPlan {
  mode: PlaybackMode;
  /** Human-readable reason, e.g. "AC3 audio" or "MPEG4 video in AVI". */
  reason?: string;
}

/** The subset of the stored ffprobe metadata the plan needs. */
export interface PlaybackMetadata {
  duration?: number;
  video?: { codec?: string };
  audio?: { codec?: string }[];
}

const BROWSER_VIDEO = new Set(["h264", "hevc", "vp9", "av1"]);
const BROWSER_AUDIO = new Set(["aac", "mp3", "opus", "vorbis", "flac"]);
// Containers a browser can open directly. Matroska works in Chromium only, but that
// is what the player is used from; the remux path covers it elsewhere.
const DIRECT_CONTAINERS = new Set(["mp4", "m4v", "mov", "webm", "mkv"]);

function extensionOf(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot + 1).toLowerCase();
}

export function planPlayback(
  filePath: string,
  metadata: PlaybackMetadata | null | undefined,
): PlaybackPlan {
  const ext = extensionOf(filePath);
  const videoCodec = metadata?.video?.codec?.toLowerCase();

  if (!videoCodec) {
    // No metadata yet: try the file as is; the player falls back on a load error.
    return DIRECT_CONTAINERS.has(ext)
      ? { mode: "direct" }
      : { mode: "remux", reason: `${ext.toUpperCase() || "unknown"} container` };
  }

  if (!BROWSER_VIDEO.has(videoCodec)) {
    return {
      mode: "unsupported",
      reason: `${videoCodec.toUpperCase()} video${ext ? ` in ${ext.toUpperCase()}` : ""}`,
    };
  }

  const audioCodec = metadata?.audio?.[0]?.codec?.toLowerCase();
  const audioOk = !audioCodec || BROWSER_AUDIO.has(audioCodec);

  if (!audioOk) return { mode: "remux", reason: `${audioCodec!.toUpperCase()} audio` };
  if (!DIRECT_CONTAINERS.has(ext)) {
    return { mode: "remux", reason: `${ext.toUpperCase() || "unknown"} container` };
  }
  return { mode: "direct" };
}

/**
 * ffmpeg arguments for the "remux" stream: first video stream copied, first audio
 * stream (if any) to stereo AAC, subtitles dropped (the player loads them as WebVTT
 * tracks), fragmented MP4 to stdout so it can be streamed while it is written.
 */
export function buildRemuxArgs(
  filePath: string,
  startSeconds: number,
  videoCodec?: string,
): string[] {
  const start = Number.isFinite(startSeconds) && startSeconds > 0 ? startSeconds : 0;
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    // Input-side seek: fast (keyframe based) and the output timeline starts at 0.
    ...(start > 0 ? ["-ss", String(start)] : []),
    "-i",
    filePath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-c:v",
    "copy",
    // Safari only accepts HEVC in MP4 under the hvc1 tag.
    ...(videoCodec?.toLowerCase() === "hevc" ? ["-tag:v", "hvc1"] : []),
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ac",
    "2",
    "-sn",
    "-movflags",
    "frag_keyframe+empty_moov+default_base_moof",
    "-f",
    "mp4",
    "pipe:1",
  ];
}

const VTT_TIME_RE = /(\d{2,}):(\d{2}):(\d{2})\.(\d{3})/g;

function formatVttTime(totalMs: number): string {
  const ms = Math.max(0, Math.round(totalMs));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(rest, 3)}`;
}

function parseVttTime(match: string): number {
  const [, h, m, s, ms] = /(\d+):(\d{2}):(\d{2})\.(\d{3})/.exec(match)!;
  return ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(ms);
}

/**
 * Moves every WebVTT cue `offsetSeconds` earlier, for a remux stream that starts at
 * that offset (its timeline restarts at 0). Cues that end before the offset are dropped;
 * a cue that straddles it is clipped to start at 0.
 */
export function shiftVttCues(vtt: string, offsetSeconds: number): string {
  if (!Number.isFinite(offsetSeconds) || offsetSeconds <= 0) return vtt;
  const offsetMs = offsetSeconds * 1000;
  const blocks = vtt.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex === -1) {
      out.push(block);
      continue;
    }
    const times = lines[timingIndex].match(VTT_TIME_RE);
    if (!times || times.length < 2) {
      out.push(block);
      continue;
    }
    const end = parseVttTime(times[1]) - offsetMs;
    if (end <= 0) continue;
    const start = parseVttTime(times[0]) - offsetMs;
    const settings = lines[timingIndex].split(times[1])[1] ?? "";
    lines[timingIndex] = `${formatVttTime(start)} --> ${formatVttTime(end)}${settings}`;
    out.push(lines.join("\n"));
  }
  return out.join("\n\n");
}

/**
 * An M3U playlist of a movie's stream URLs (one entry per part), for "Play in VLC"
 * when FilmPick runs on a server: the browser downloads it and the OS opens it in the
 * default player. VLC plays every container and codec, so it uses the direct stream.
 */
export function buildM3uPlaylist(
  origin: string,
  movieId: number,
  title: string,
  partCount: number,
): string {
  const parts = Math.max(1, partCount);
  const lines = ["#EXTM3U"];
  for (let part = 0; part < parts; part++) {
    const label = parts > 1 ? `${title} (part ${part + 1})` : title;
    lines.push(`#EXTINF:-1,${label.replace(/[\r\n]+/g, " ")}`);
    lines.push(`${origin}/api/movies/${movieId}/stream?part=${part}`);
  }
  return lines.join("\n") + "\n";
}
