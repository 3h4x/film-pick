import { describe, it, expect } from "vitest";
import {
  buildM3uPlaylist,
  buildRemuxArgs,
  planPlayback,
  shiftVttCues,
  videoMimeType,
} from "@/lib/playback";

const meta = (video: string, audio?: string) => ({
  video: { codec: video },
  audio: audio ? [{ codec: audio }] : [],
});

describe("videoMimeType", () => {
  it("describes 10-bit HEVC with its level so the browser is asked about the real stream", () => {
    expect(
      videoMimeType({ codec: "hevc", profile: "Main 10", pix_fmt: "yuv420p10le", level: 120 }),
    ).toBe('video/mp4; codecs="hvc1.2.4.L120.B0"');
    expect(videoMimeType({ codec: "hevc", profile: "Main" })).toBe(
      'video/mp4; codecs="hvc1.1.6.L120.B0"',
    );
  });

  it("covers H.264, VP9 and AV1, and nothing a browser cannot play", () => {
    expect(videoMimeType({ codec: "h264", profile: "High", level: 41 })).toBe(
      'video/mp4; codecs="avc1.640029"',
    );
    expect(videoMimeType({ codec: "vp9", pix_fmt: "yuv420p10le" })).toBe(
      'video/mp4; codecs="vp09.02.10.10"',
    );
    expect(videoMimeType({ codec: "av1" })).toBe('video/mp4; codecs="av01.0.08M.08"');
    expect(videoMimeType({ codec: "mpeg4" })).toBeNull();
    expect(videoMimeType(undefined)).toBeNull();
  });
});

describe("planPlayback", () => {
  it("marks browser video this browser cannot decode as unsupported", () => {
    const hevc10 = {
      video: { codec: "hevc", profile: "Main 10", pix_fmt: "yuv420p10le", level: 120 },
      audio: [{ codec: "aac" }],
    };
    expect(planPlayback("/mnt/library/Sample/Sample.mp4", hevc10, () => false)).toEqual({
      mode: "unsupported",
      reason: "HEVC Main 10 video is not supported by this browser",
    });
    expect(planPlayback("/mnt/library/Sample/Sample.mp4", hevc10, () => true).mode).toBe(
      "direct",
    );
    // Without a decoder check the plan stays optimistic, as on the server.
    expect(planPlayback("/mnt/library/Sample/Sample.mp4", hevc10).mode).toBe("direct");
  });

  it("plays H.264 + AAC in MP4 or Matroska directly", () => {
    expect(planPlayback("/mnt/library/Sample/Sample.mp4", meta("h264", "aac")).mode).toBe("direct");
    expect(planPlayback("/mnt/library/Sample/Sample.mkv", meta("h264", "aac")).mode).toBe("direct");
  });

  it("remuxes when only the audio codec is not browser-playable", () => {
    expect(planPlayback("/mnt/library/Sample/Sample.mkv", meta("h264", "ac3"))).toEqual({
      mode: "remux",
      reason: "AC3 audio",
    });
    expect(planPlayback("/mnt/library/Sample/Sample.mkv", meta("hevc", "eac3")).mode).toBe("remux");
    expect(planPlayback("/mnt/library/Sample/Sample.mp4", meta("h264", "dts")).mode).toBe("remux");
  });

  it("remuxes browser video in a container a browser cannot open", () => {
    expect(planPlayback("/mnt/library/Sample/Sample.avi", meta("h264", "mp3"))).toEqual({
      mode: "remux",
      reason: "AVI container",
    });
  });

  it("marks video that would need a full re-encode as unsupported", () => {
    expect(planPlayback("/mnt/library/Sample/Sample.avi", meta("mpeg4", "mp3"))).toEqual({
      mode: "unsupported",
      reason: "MPEG4 video in AVI",
    });
    expect(planPlayback("/mnt/library/Sample/Sample.mkv", meta("mpeg2video", "ac3")).mode).toBe(
      "unsupported",
    );
  });

  it("tries the file directly when there is no metadata yet", () => {
    expect(planPlayback("/mnt/library/Sample/Sample.mp4", null).mode).toBe("direct");
    expect(planPlayback("/mnt/library/Sample/Sample.avi", null).mode).toBe("remux");
  });

  it("treats a file without audio as playable", () => {
    expect(planPlayback("/mnt/library/Sample/Sample.mp4", meta("h264")).mode).toBe("direct");
  });
});

describe("buildRemuxArgs", () => {
  it("copies video, converts the first audio track to AAC and writes fragmented MP4", () => {
    const args = buildRemuxArgs("/mnt/library/Sample/Sample.mkv", 0, "h264");
    expect(args).not.toContain("-ss");
    expect(args.join(" ")).toContain("-i /mnt/library/Sample/Sample.mkv");
    expect(args.join(" ")).toContain("-map 0:v:0 -map 0:a:0? -c:v copy");
    expect(args.join(" ")).toContain("-c:a aac");
    expect(args.join(" ")).toContain("frag_keyframe+empty_moov+default_base_moof");
    expect(args.at(-1)).toBe("pipe:1");
    expect(args).not.toContain("hvc1");
  });

  it("seeks on the input side and tags HEVC for Safari", () => {
    const args = buildRemuxArgs("/mnt/library/Sample/Sample.mkv", 600, "hevc");
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
    expect(args[args.indexOf("-ss") + 1]).toBe("600");
    expect(args.join(" ")).toContain("-tag:v hvc1");
  });

  it("ignores a negative or invalid start", () => {
    expect(buildRemuxArgs("/x.mkv", -5)).not.toContain("-ss");
    expect(buildRemuxArgs("/x.mkv", Number.NaN)).not.toContain("-ss");
  });
});

describe("shiftVttCues", () => {
  const vtt = [
    "WEBVTT",
    "1\n00:00:05.000 --> 00:00:07.000\nFirst line",
    "2\n00:01:59.000 --> 00:02:01.500 line:90%\nStraddles the offset",
    "3\n00:10:00.250 --> 00:10:02.000\nLater line",
  ].join("\n\n");

  it("returns the input unchanged without an offset", () => {
    expect(shiftVttCues(vtt, 0)).toBe(vtt);
  });

  it("drops cues before the offset, clips the straddling one and shifts the rest", () => {
    const out = shiftVttCues(vtt, 120);
    expect(out).not.toContain("First line");
    expect(out).toContain("00:00:00.000 --> 00:00:01.500 line:90%\nStraddles the offset");
    expect(out).toContain("00:08:00.250 --> 00:08:02.000\nLater line");
    expect(out.startsWith("WEBVTT")).toBe(true);
  });
});

describe("buildM3uPlaylist", () => {
  it("lists one stream URL per part", () => {
    const m3u = buildM3uPlaylist("https://filmpick.example", 42, "Sample Movie", 2);
    expect(m3u).toBe(
      [
        "#EXTM3U",
        "#EXTINF:-1,Sample Movie (part 1)",
        "https://filmpick.example/api/movies/42/stream?part=0",
        "#EXTINF:-1,Sample Movie (part 2)",
        "https://filmpick.example/api/movies/42/stream?part=1",
        "",
      ].join("\n"),
    );
  });

  it("keeps a single part unlabelled and strips newlines from the title", () => {
    const m3u = buildM3uPlaylist("http://localhost:4000", 7, "Sample\nMovie", 1);
    expect(m3u).toContain("#EXTINF:-1,Sample Movie\n");
    expect(m3u).toContain("http://localhost:4000/api/movies/7/stream?part=0");
  });
});
