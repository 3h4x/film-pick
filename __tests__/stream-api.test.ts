// tamtam inspected 2026-05-21
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { initDb, insertMovie } from "@/lib/db";

const { mockStat, mockReadFile, mockCreateReadStream, mockSpawn } = vi.hoisted(() => ({
  mockStat: vi.fn(),
  mockReadFile: vi.fn(),
  mockCreateReadStream: vi.fn(),
  mockSpawn: vi.fn(),
}));

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, spawn: mockSpawn };
});

vi.mock("fs/promises", () => ({
  default: { readFile: mockReadFile },
  readFile: mockReadFile,
  stat: mockStat,
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      createReadStream: mockCreateReadStream,
      promises: { readFile: mockReadFile },
    },
    createReadStream: mockCreateReadStream,
    promises: { ...actual.promises, readFile: mockReadFile },
  };
});

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { GET } from "@/app/api/movies/[id]/stream/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-stream-api.db");

function makeParams(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function getReq(
  id: number,
  options: {
    range?: string;
    part?: number;
    sub?: string;
    mode?: string;
    start?: number;
    shift?: number;
  } = {},
) {
  const url = new URL(`http://localhost/api/movies/${id}/stream`);
  if (options.part !== undefined) url.searchParams.set("part", String(options.part));
  if (options.sub) url.searchParams.set("sub", options.sub);
  if (options.mode) url.searchParams.set("mode", options.mode);
  if (options.start !== undefined) url.searchParams.set("start", String(options.start));
  if (options.shift !== undefined) url.searchParams.set("shift", String(options.shift));
  const headers: Record<string, string> = {};
  if (options.range) headers["range"] = options.range;
  return new NextRequest(url.toString(), { headers });
}

const FAKE_STREAM = { pipe: vi.fn() };

describe("movies/[id]/stream GET handler", () => {
  let db: Database.Database;
  let movieId: number;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db);
    mockCreateReadStream.mockReturnValue(FAKE_STREAM);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
  });

  it("returns 404 when movie does not exist", async () => {
    const res = await GET(getReq(99999), makeParams(99999));
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toMatch(/not found/i);
  });

  it("returns 404 when movie has no file_path", async () => {
    movieId = insertMovie(db, {
      title: "No File",
      year: 2020,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(404);
  });

  describe("with a movie that has file_path", () => {
    const FILE_PATH = "/movies/Inception/Inception.mp4";
    const FILE_SIZE = 1_000_000;

    beforeEach(() => {
      movieId = insertMovie(db, {
        title: "Inception",
        year: 2010,
        genre: "Sci-Fi",
        director: "Christopher Nolan",
        rating: 8.8,
        poster_url: null,
        source: "tmdb",
        imdb_id: null,
        tmdb_id: 27205,
        type: "movie",
      });
      db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(FILE_PATH, movieId);
      mockStat.mockResolvedValue({ size: FILE_SIZE });
    });

    it("returns 200 with full file when no range header", async () => {
      const res = await GET(getReq(movieId), makeParams(movieId));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("video/mp4");
      expect(res.headers.get("Content-Length")).toBe(String(FILE_SIZE));
      expect(mockCreateReadStream).toHaveBeenCalledWith(FILE_PATH);
    });

    it("returns video/x-matroska content type for .mkv files", async () => {
      db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
        "/movies/Inception/Inception.mkv",
        movieId,
      );
      const res = await GET(getReq(movieId), makeParams(movieId));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("video/x-matroska");
    });

    it("returns 206 partial content for a range request", async () => {
      const res = await GET(getReq(movieId, { range: "bytes=0-99999" }), makeParams(movieId));
      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Range")).toBe(`bytes 0-99999/${FILE_SIZE}`);
      expect(res.headers.get("Accept-Ranges")).toBe("bytes");
      expect(res.headers.get("Content-Length")).toBe("100000");
      expect(mockCreateReadStream).toHaveBeenCalledWith(FILE_PATH, { start: 0, end: 99999 });
    });

    it("calculates end as file size - 1 when range end is omitted", async () => {
      const res = await GET(getReq(movieId, { range: "bytes=500000-" }), makeParams(movieId));
      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Range")).toBe(
        `bytes 500000-${FILE_SIZE - 1}/${FILE_SIZE}`,
      );
    });

    it("returns 416 when range start is beyond file size", async () => {
      const res = await GET(
        getReq(movieId, { range: `bytes=${FILE_SIZE + 1}-` }),
        makeParams(movieId),
      );
      expect(res.status).toBe(416);
    });

    it("returns 404 when requesting a non-existent extra file part", async () => {
      const res = await GET(getReq(movieId, { part: 2 }), makeParams(movieId));
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toMatch(/part not found/i);
    });

    it("serves an extra file when part=1 and extra_files is set", async () => {
      const extra = "/movies/Inception/Inception.part2.mp4";
      db.prepare("UPDATE movies SET extra_files = ? WHERE id = ?").run(
        JSON.stringify([extra]),
        movieId,
      );
      const res = await GET(getReq(movieId, { part: 1 }), makeParams(movieId));
      expect(res.status).toBe(200);
      expect(mockCreateReadStream).toHaveBeenCalledWith(extra);
    });
  });

  describe("compatibility (remux) stream", () => {
    const FILE_PATH = "/mnt/library/Sample Movie (1999)/Sample Movie.mkv";

    function fakeFfmpeg() {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { EventEmitter } = require("events") as typeof import("events");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PassThrough } = require("stream") as typeof import("stream");
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        exitCode: null as number | null,
        signalCode: null as string | null,
        kill: vi.fn(function (this: { signalCode: string | null }) {
          this.signalCode = "SIGKILL";
          return true;
        }),
      });
      return child;
    }

    beforeEach(() => {
      movieId = insertMovie(db, {
        title: "Sample Movie",
        year: 1999,
        genre: "Drama",
        director: null,
        rating: null,
        poster_url: null,
        source: "local",
        imdb_id: null,
        tmdb_id: null,
        type: "movie",
      });
      db.prepare("UPDATE movies SET file_path = ?, video_metadata = ? WHERE id = ?").run(
        FILE_PATH,
        JSON.stringify({ video: { codec: "hevc" }, audio: [{ codec: "eac3" }] }),
        movieId,
      );
    });

    it("streams ffmpeg's fragmented MP4 from the requested offset", async () => {
      const child = fakeFfmpeg();
      mockSpawn.mockReturnValue(child);

      const res = await GET(getReq(movieId, { mode: "remux", start: 600 }), makeParams(movieId));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("video/mp4");

      const [cmd, args] = mockSpawn.mock.calls[0];
      expect(cmd).toBe("ffmpeg");
      expect(args).toEqual(expect.arrayContaining(["-ss", "600", "-i", FILE_PATH, "-tag:v", "hvc1"]));
      expect(mockStat).not.toHaveBeenCalled();

      child.stdout.end(Buffer.from("fragment"));
      expect(await res.text()).toBe("fragment");
      child.emit("close", 0, null);
    });

    it("kills ffmpeg when the player drops the connection", async () => {
      const child = fakeFfmpeg();
      mockSpawn.mockReturnValue(child);
      const controller = new AbortController();
      const req = new NextRequest(
        `http://localhost/api/movies/${movieId}/stream?mode=remux`,
        { signal: controller.signal },
      );

      await GET(req, makeParams(movieId));
      controller.abort();
      expect(child.kill).toHaveBeenCalledWith("SIGKILL");
      child.emit("close", null, "SIGKILL");
    });

    it("refuses a third concurrent stream", async () => {
      const children = [fakeFfmpeg(), fakeFfmpeg()];
      mockSpawn.mockReturnValueOnce(children[0]).mockReturnValueOnce(children[1]);

      await GET(getReq(movieId, { mode: "remux" }), makeParams(movieId));
      await GET(getReq(movieId, { mode: "remux" }), makeParams(movieId));
      const third = await GET(getReq(movieId, { mode: "remux" }), makeParams(movieId));
      expect(third.status).toBe(503);
      expect(mockSpawn).toHaveBeenCalledTimes(2);

      for (const child of children) child.emit("close", 0, null);
    });
  });

  describe("subtitle serving", () => {
    const FILE_PATH = "/movies/Dune/Dune.mp4";
    const SUB_DIR = "/movies/Dune";

    beforeEach(() => {
      movieId = insertMovie(db, {
        title: "Dune",
        year: 2021,
        genre: "Sci-Fi",
        director: "Denis Villeneuve",
        rating: 7.9,
        poster_url: null,
        source: "tmdb",
        imdb_id: null,
        tmdb_id: 438631,
        type: "movie",
      });
      db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(FILE_PATH, movieId);
    });

    it("serves a VTT subtitle file as-is", async () => {
      const vttContent = "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello";
      mockReadFile.mockResolvedValue(Buffer.from(vttContent, "utf8"));

      const res = await GET(getReq(movieId, { sub: "Dune.vtt" }), makeParams(movieId));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/vtt");
      expect(res.headers.get("Content-Disposition")).toBe("inline");
      const text = await res.text();
      expect(text).toBe(vttContent);
      // Read as bytes, not as a UTF-8 string — the encoding is sniffed, not assumed.
      expect(mockReadFile).toHaveBeenCalledWith(path.join(SUB_DIR, "Dune.vtt"));
    });

    it("shifts cues for a compatibility stream that starts at an offset", async () => {
      const srtContent =
        "1\n00:00:01,000 --> 00:00:03,000\nBefore\n\n2\n00:02:05,000 --> 00:02:07,000\nAfter\n";
      mockReadFile.mockResolvedValue(Buffer.from(srtContent, "utf8"));

      const res = await GET(getReq(movieId, { sub: "Dune.srt", shift: 120 }), makeParams(movieId));
      const text = await res.text();
      expect(text).not.toContain("Before");
      expect(text).toContain("00:00:05.000 --> 00:00:07.000");
    });

    it("converts SRT to VTT format", async () => {
      const srtContent = "1\n00:00:01,000 --> 00:00:03,000\nHello world\n";
      mockReadFile.mockResolvedValue(Buffer.from(srtContent, "utf8"));

      const res = await GET(getReq(movieId, { sub: "Dune.srt" }), makeParams(movieId));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/vtt");
      const text = await res.text();
      expect(text).toMatch(/^WEBVTT/);
      expect(text).toContain("00:00:01.000 --> 00:00:03.000");
    });

    it("converts a MicroDVD payload served under a .sub name", async () => {
      // standardize deliberately renames MicroDVD to .sub; the old extension-based
      // branch shipped the raw frame markers under text/vtt and the track died.
      mockReadFile.mockResolvedValue(
        Buffer.from("{24}{48}Hello world", "utf8"),
      );

      const res = await GET(getReq(movieId, { sub: "Dune.sub" }), makeParams(movieId));
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toMatch(/^WEBVTT/);
      expect(text).toContain("-->");
      expect(text).toContain("Hello world");
      expect(text).not.toContain("{24}");
    });

    it("decodes a windows-1250 subtitle without mojibake", async () => {
      // "TYTUŁU" in CP1250 — 0xA3 is invalid UTF-8, so a forced utf-8 read
      // used to turn every Polish diacritic into U+FFFD.
      const cp1250 = Buffer.concat([
        Buffer.from("1\r\n00:00:01,000 --> 00:00:03,000\r\nTYTU", "latin1"),
        Buffer.from([0xa3]),
        Buffer.from("U\r\n", "latin1"),
      ]);
      mockReadFile.mockResolvedValue(cp1250);

      const res = await GET(getReq(movieId, { sub: "Dune.srt" }), makeParams(movieId));
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("TYTUŁU");
      expect(text).not.toContain("�");
    });

    it("returns 415 for a format a <track> cannot render", async () => {
      mockReadFile.mockResolvedValue(
        Buffer.from("[Script Info]\nScriptType: v4.00+\n", "utf8"),
      );

      const res = await GET(getReq(movieId, { sub: "Dune.ass" }), makeParams(movieId));
      expect(res.status).toBe(415);
    });

    it("returns 404 when subtitle file does not exist", async () => {
      mockReadFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

      const res = await GET(getReq(movieId, { sub: "missing.srt" }), makeParams(movieId));
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toMatch(/subtitle not found/i);
    });

    it("rejects path traversal via .. segments", async () => {
      const res = await GET(getReq(movieId, { sub: "../secret.txt" }), makeParams(movieId));
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toMatch(/invalid subtitle path/i);
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it("rejects deeply nested path traversal", async () => {
      const res = await GET(getReq(movieId, { sub: "../../etc/passwd" }), makeParams(movieId));
      expect(res.status).toBe(400);
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it("allows subtitle in a valid subdirectory", async () => {
      const vttContent = "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nSub";
      mockReadFile.mockResolvedValue(Buffer.from(vttContent, "utf8"));

      const res = await GET(getReq(movieId, { sub: "subs/Dune.vtt" }), makeParams(movieId));
      expect(res.status).toBe(200);
      expect(mockReadFile).toHaveBeenCalledWith(
        path.join(SUB_DIR, "subs/Dune.vtt"),
      );
    });
  });
});
