/**
 * Which streams of a library file are "universally playable", i.e. play on practically
 * any player, TV or phone without the media server transcoding them first.
 *
 * Deliberately stricter than `planPlayback` (`lib/playback.ts`), which answers a
 * different question: can *this browser* play the file? A browser may decode HEVC, VP9,
 * AV1, Opus or FLAC natively, so `planPlayback` streams those directly, but many TVs,
 * older phones and media-server clients cannot, and the server then re-encodes them on
 * playback. Here only H.264 (8-bit) video and AAC / MP3 audio count as compatible.
 *
 * Inputs come from the ffprobe metadata stored on the movie (`video_metadata`):
 * `video.codec` / `audio[].codec` are ffprobe `codec_name` values; `video.profile` and
 * `video.pix_fmt` are only present on metadata probed since they were added, so a
 * missing value is treated as "unknown", not as a problem.
 */

/** Aliases (container tags, encoder names) mapped to ffprobe's `codec_name`. */
const CODEC_ALIASES: Record<string, string> = {
  avc: "h264",
  avc1: "h264",
  "h.264": "h264",
  x264: "h264",
  "h.265": "hevc",
  h265: "hevc",
  x265: "hevc",
  hvc1: "hevc",
  hev1: "hevc",
  "e-ac-3": "eac3",
  "ac-3": "ac3",
  mp3float: "mp3",
};

/** Lower-cases a codec name and maps common aliases to ffprobe's `codec_name`. */
export function normalizeCodec(codec: string | null | undefined): string {
  const lower = (codec ?? "").trim().toLowerCase();
  return CODEC_ALIASES[lower] ?? lower;
}

const COMPATIBLE_AUDIO = new Set(["aac", "mp3"]);

// H.264 profiles beyond High (High 10, High 4:2:2, High 4:4:4) have no hardware decoder
// on most devices.
const UNSUPPORTED_H264_PROFILE = /high\s*10|4:2:2|4:4:4/i;

/** Bit depth from an ffmpeg pixel format, e.g. yuv420p10le -> 10; 8 when none is given. */
function pixelFormatBitDepth(pixFmt: string): number {
  const match = /p(\d{1,2})(le|be)?$/i.exec(pixFmt.trim());
  return match ? Number(match[1]) : 8;
}

export interface VideoStreamInfo {
  codec?: string | null;
  profile?: string | null;
  pix_fmt?: string | null;
}

/**
 * True when the video stream plays without transcoding: 8-bit H.264. An unknown codec
 * (no metadata) counts as compatible so no badge is shown for missing data.
 */
export function isVideoCompatible(video: VideoStreamInfo | null | undefined): boolean {
  const codec = normalizeCodec(video?.codec);
  if (!codec) return true;
  if (codec !== "h264") return false;
  if (video?.profile && UNSUPPORTED_H264_PROFILE.test(video.profile)) return false;
  if (video?.pix_fmt && pixelFormatBitDepth(video.pix_fmt) > 8) return false;
  return true;
}

/** True when an audio track plays without conversion: AAC or MP3. Unknown counts as compatible. */
export function isAudioCompatible(codec: string | null | undefined): boolean {
  const normalized = normalizeCodec(codec);
  return !normalized || COMPATIBLE_AUDIO.has(normalized);
}
