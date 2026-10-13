import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TechnicalDetails from "@/components/movie-detail/TechnicalDetails";
import type { VideoMetadata } from "@/components/movie-detail/types";
import {
  isAudioCompatible,
  isVideoCompatible,
  normalizeCodec,
} from "@/lib/codec-compat";

describe("normalizeCodec", () => {
  it("lower-cases and maps aliases to ffprobe codec names", () => {
    expect(normalizeCodec("H264")).toBe("h264");
    expect(normalizeCodec("avc1")).toBe("h264");
    expect(normalizeCodec("x265")).toBe("hevc");
    expect(normalizeCodec(" E-AC-3 ")).toBe("eac3");
    expect(normalizeCodec(undefined)).toBe("");
  });
});

describe("isVideoCompatible", () => {
  it("accepts 8-bit H.264 under any spelling", () => {
    for (const codec of ["h264", "H264", "avc", "avc1", "AVC1", "H.264"]) {
      expect(isVideoCompatible({ codec })).toBe(true);
    }
    expect(isVideoCompatible({ codec: "h264", profile: "High", pix_fmt: "yuv420p" })).toBe(true);
    expect(isVideoCompatible({ codec: "h264", profile: "Main", pix_fmt: "yuvj420p" })).toBe(true);
  });

  it("rejects every other video codec, including ones some browsers play", () => {
    for (const codec of ["hevc", "H265", "x265", "mpeg4", "mpeg2video", "vc1", "vp9", "av1", "msmpeg4v3"]) {
      expect(isVideoCompatible({ codec })).toBe(false);
    }
  });

  it("rejects 10-bit H.264 by profile or pixel format", () => {
    expect(isVideoCompatible({ codec: "h264", profile: "High 10" })).toBe(false);
    expect(isVideoCompatible({ codec: "h264", profile: "High 4:2:2" })).toBe(false);
    expect(isVideoCompatible({ codec: "h264", profile: "High 4:4:4 Predictive" })).toBe(false);
    expect(isVideoCompatible({ codec: "h264", pix_fmt: "yuv420p10le" })).toBe(false);
  });

  it("does not flag missing metadata", () => {
    expect(isVideoCompatible(undefined)).toBe(true);
    expect(isVideoCompatible({})).toBe(true);
  });
});

describe("isAudioCompatible", () => {
  it("accepts AAC and MP3 in any case", () => {
    for (const codec of ["aac", "AAC", "mp3", "MP3"]) {
      expect(isAudioCompatible(codec)).toBe(true);
    }
  });

  it("rejects other audio codecs", () => {
    for (const codec of ["ac3", "eac3", "EAC3", "E-AC-3", "dts", "truehd", "flac", "opus", "vorbis", "pcm_s16le"]) {
      expect(isAudioCompatible(codec)).toBe(false);
    }
  });

  it("does not flag an unknown codec", () => {
    expect(isAudioCompatible(undefined)).toBe(true);
    expect(isAudioCompatible("")).toBe(true);
  });
});

describe("TechnicalDetails compatibility badges", () => {
  const render = (metadata: VideoMetadata) =>
    renderToStaticMarkup(
      <TechnicalDetails videoMetadata={metadata} isLoadingMetadata={false} />,
    );
  const count = (html: string, text: string) => html.split(text).length - 1;

  it("badges HEVC video and an EAC3 track", () => {
    const html = render({
      video: { codec: "hevc", width: 1920, height: 1080 },
      audio: [
        { codec: "eac3", channels: 6, language: "eng" },
        { codec: "aac", channels: 2, language: "eng" },
      ],
    });
    expect(count(html, "Not compatible")).toBe(2);
    expect(html).toContain("Most players and the media server have to re-encode this video to play it");
    expect(html).toContain("Most players have to convert this audio track to play it");
  });

  it("shows no badge for H.264 with AAC", () => {
    const html = render({
      video: { codec: "h264", width: 1920, height: 1080, profile: "High", pix_fmt: "yuv420p" },
      audio: [{ codec: "aac", channels: 2, language: "eng" }],
    });
    expect(html).not.toContain("Not compatible");
  });
});
