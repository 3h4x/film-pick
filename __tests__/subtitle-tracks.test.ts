import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import fs from "fs";
import os from "os";
import path from "path";

const { mockExecFile, mockSpawn } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockSpawn: vi.fn(),
}));

vi.mock("child_process", () => ({
  execFile: mockExecFile,
  spawn: mockSpawn,
  default: { execFile: mockExecFile, spawn: mockSpawn },
}));

import {
  buildStripArgs,
  normalizeSubtitleTrackLanguages,
  parseSubtitleTrackLanguages,
  stripForeignSubtitleTracks,
  subtitleStreamsToDrop,
  type ProbedStream,
} from "@/lib/subtitle-tracks";

const PL_EN = ["pol", "eng"];

const PARTIAL = ".filmpick-partial";

function stream(index: number, codecType: string, language: string | null = null): ProbedStream {
  return { index, codecType, language };
}

function ffprobeJson(streams: ProbedStream[]): string {
  return JSON.stringify({
    streams: streams.map((s) => ({
      index: s.index,
      codec_type: s.codecType,
      ...(s.language ? { tags: { language: s.language } } : {}),
    })),
  });
}

/** Answer each ffprobe call in turn with the given stream lists. */
function probeReturns(...lists: ProbedStream[][]) {
  for (const list of lists) {
    mockExecFile.mockImplementationOnce(
      (_cmd: string, _args: string[], _opts: unknown, cb: (e: Error | null, r: { stdout: string; stderr: string }) => void) =>
        cb(null, { stdout: ffprobeJson(list), stderr: "" }),
    );
  }
}

/** A fake ffmpeg that writes `content` to its output path and exits with `code`. */
function ffmpegWrites(content: string, code = 0) {
  mockSpawn.mockImplementationOnce((_cmd: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
    child.stderr = new EventEmitter();
    setImmediate(() => {
      fs.writeFileSync(args[args.length - 1], content);
      if (code !== 0) child.stderr.emit("data", Buffer.from("muxer error"));
      child.emit("close", code);
    });
    return child;
  });
}

const SOURCE = [
  stream(0, "video"),
  stream(1, "audio", "eng"),
  stream(2, "subtitle", "pol"),
  stream(3, "subtitle", "eng"),
  stream(4, "subtitle", "fre"),
  stream(5, "subtitle", "ger"),
  stream(6, "subtitle"),
];
const STRIPPED = [
  stream(0, "video"),
  stream(1, "audio", "eng"),
  stream(2, "subtitle", "pol"),
  stream(3, "subtitle", "eng"),
  stream(4, "subtitle"),
];

describe("parseSubtitleTrackLanguages", () => {
  it("defaults to Polish and English when never set", () => {
    expect(parseSubtitleTrackLanguages(null)).toEqual(["pol", "eng"]);
  });

  it("reads a stored list, and an empty one as keep-all", () => {
    expect(parseSubtitleTrackLanguages("pol,spa")).toEqual(["pol", "spa"]);
    expect(parseSubtitleTrackLanguages("")).toEqual([]);
  });

  it("normalizes case, spaces and duplicates, and rejects non-codes", () => {
    expect(normalizeSubtitleTrackLanguages(["ENG", " pl ", "eng", ""])).toEqual(["eng", "pl"]);
    expect(() => normalizeSubtitleTrackLanguages(["english"])).toThrow(/language code/);
  });
});

describe("subtitleStreamsToDrop", () => {
  it("keeps Polish, English and untagged tracks, drops the rest", () => {
    expect(subtitleStreamsToDrop(SOURCE, PL_EN)).toEqual([4, 5]);
  });

  it("keeps whatever languages are configured, matching their other tags", () => {
    const streams = [
      stream(0, "subtitle", "ger"),
      stream(1, "subtitle", "deu"),
      stream(2, "subtitle", "de"),
      stream(3, "subtitle", "pol"),
    ];
    // Config holds "deu"; files tag German as ger/deu/de.
    expect(subtitleStreamsToDrop(streams, ["deu"])).toEqual([3]);
  });

  it("drops nothing when the list is empty", () => {
    expect(subtitleStreamsToDrop(SOURCE, [])).toEqual([]);
  });

  it("accepts two-letter and spelled-out tags in any case", () => {
    const streams = [
      stream(0, "subtitle", "PL"),
      stream(1, "subtitle", "en"),
      stream(2, "subtitle", "English"),
      stream(3, "subtitle", "und"),
      stream(4, "subtitle", "spa"),
    ];
    expect(subtitleStreamsToDrop(streams, PL_EN)).toEqual([4]);
  });

  it("never drops audio or video, whatever their language", () => {
    expect(subtitleStreamsToDrop([stream(0, "video"), stream(1, "audio", "fre")], PL_EN)).toEqual([]);
  });
});

describe("buildStripArgs", () => {
  it("copies every stream except the dropped ones, metadata and chapters included", () => {
    const args = buildStripArgs("/in.mkv", "/in.mkv.partial", "matroska", [4, 5]);
    expect(args).toEqual(
      expect.arrayContaining(["-map", "0", "-map", "-0:4", "-map", "-0:5", "-c", "copy"]),
    );
    expect(args.slice(-3)).toEqual(["-f", "matroska", "/in.mkv.partial"]);
    expect(args).toContain("-map_chapters");
  });
});

describe("stripForeignSubtitleTracks", () => {
  let dir: string;
  let video: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "subtitle-tracks-"));
    video = path.join(dir, "Sample Movie.mkv");
    fs.writeFileSync(video, "original video bytes");
    mockExecFile.mockReset();
    mockSpawn.mockReset();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("rewrites the file without the foreign tracks", async () => {
    probeReturns(SOURCE, STRIPPED);
    ffmpegWrites("stripped video bytes");

    const result = await stripForeignSubtitleTracks(video, PL_EN);

    expect(result).toEqual({ removed: 2, kept: 3 });
    expect(fs.readFileSync(video, "utf8")).toBe("stripped video bytes");
    expect(fs.existsSync(video + PARTIAL)).toBe(false);
    const args = mockSpawn.mock.calls[0][1] as string[];
    expect(args).toContain("-0:4");
    expect(args).toContain("-0:5");
    expect(args[args.length - 1]).toBe(video + PARTIAL);
  });

  it("does not touch a file with nothing to remove", async () => {
    probeReturns(STRIPPED);

    expect(await stripForeignSubtitleTracks(video, PL_EN)).toEqual({ removed: 0, kept: 3 });
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(fs.readFileSync(video, "utf8")).toBe("original video bytes");
  });

  it("skips containers it can't write back, without probing them", async () => {
    const avi = path.join(dir, "Sample Movie.avi");
    fs.writeFileSync(avi, "x");

    expect(await stripForeignSubtitleTracks(avi, PL_EN)).toEqual({ removed: 0, kept: 0 });
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("does not even probe the file when every track is kept (empty list)", async () => {
    expect(await stripForeignSubtitleTracks(video, [])).toEqual({ removed: 0, kept: 0 });
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("keeps the original when the rewritten file lost a stream it should have kept", async () => {
    probeReturns(SOURCE, [stream(0, "video"), stream(1, "subtitle", "pol")]);
    ffmpegWrites("broken copy");

    await expect(stripForeignSubtitleTracks(video, PL_EN)).rejects.toThrow(/stream check failed/);
    expect(fs.readFileSync(video, "utf8")).toBe("original video bytes");
    expect(fs.existsSync(video + PARTIAL)).toBe(false);
  });

  it("keeps the original when ffmpeg fails", async () => {
    probeReturns(SOURCE);
    ffmpegWrites("half written", 1);

    await expect(stripForeignSubtitleTracks(video, PL_EN)).rejects.toThrow(/ffmpeg exited with 1/);
    expect(fs.readFileSync(video, "utf8")).toBe("original video bytes");
    expect(fs.existsSync(video + PARTIAL)).toBe(false);
  });
});
