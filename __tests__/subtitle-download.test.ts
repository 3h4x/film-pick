import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { initDb, insertMovie } from "@/lib/db";
import { napiprojektHash, fetchNapiprojektSubtitle } from "@/lib/napiprojekt";
import {
  opensubtitlesHash,
  _resetOpenSubtitlesSessionForTests,
} from "@/lib/opensubtitles";
import {
  downloadSubtitle,
  downloadMissingSubtitles,
  type BulkSubtitleEvent,
} from "@/lib/subtitle-download";

// No real video to probe; the fps falls back to the film default.
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return {
    ...actual,
    execFile: (...args: unknown[]) => {
      const callback = args[args.length - 1];
      if (typeof callback === "function") callback(new Error("no ffprobe"));
    },
  };
});

const MICRODVD = "{24}{48}Wykryto ruch.\r\n{96}{120}Co to jest?\r\n";

function napiXml(content: string | null) {
  return content === null
    ? '<?xml version="1.0"?>\n<result><response_time>0.009 s.</response_time></result>'
    : `<?xml version="1.0"?>\n<result><status>success</status><subtitles><content><![CDATA[${Buffer.from(content).toString("base64")}]]></content></subtitles></result>`;
}

function textResponse(body: string, status = 200) {
  return new Response(body, { status });
}

let tmpDir: string;
let videoPath: string;
const originalFetch = global.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "filmpick-subs-"));
  fs.mkdirSync(path.join(tmpDir, "Movie"));
  videoPath = path.join(tmpDir, "Movie", "Movie (1999).avi");
  const bytes = Buffer.alloc(300 * 1024);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  fs.writeFileSync(videoPath, bytes);
  delete process.env.OPENSUBTITLES_API_KEY;
  delete process.env.OPENSUBTITLES_USERNAME;
  delete process.env.OPENSUBTITLES_PASSWORD;
  _resetOpenSubtitlesSessionForTests();
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("hashes", () => {
  it("napiprojektHash is the MD5 of the first 10 MiB (whole file when smaller)", async () => {
    const expected = crypto
      .createHash("md5")
      .update(fs.readFileSync(videoPath))
      .digest("hex");
    expect(await napiprojektHash(videoPath)).toBe(expected);
  });

  it("opensubtitlesHash adds the file size to the 64-bit words of both ends", async () => {
    const file = path.join(tmpDir, "zeros.mkv");
    const bytes = Buffer.alloc(128 * 1024);
    bytes.writeBigUInt64LE(BigInt(1), 0); // first chunk
    bytes.writeBigUInt64LE(BigInt(2), bytes.length - 8); // last chunk
    fs.writeFileSync(file, bytes);
    // 131072 (0x20000) + 1 + 2
    expect(await opensubtitlesHash(file)).toBe("0000000000020003");
  });

  it("opensubtitlesHash wraps at 64 bits", async () => {
    const file = path.join(tmpDir, "big.mkv");
    const bytes = Buffer.alloc(128 * 1024);
    bytes.writeBigUInt64LE(BigInt("0xffffffffffffffff"), 0);
    fs.writeFileSync(file, bytes);
    expect(await opensubtitlesHash(file)).toBe("000000000001ffff");
  });

  it("opensubtitlesHash is null for files too small to hash", async () => {
    const file = path.join(tmpDir, "tiny.mkv");
    fs.writeFileSync(file, Buffer.alloc(1000));
    expect(await opensubtitlesHash(file)).toBeNull();
  });
});

describe("fetchNapiprojektSubtitle", () => {
  it("decodes the base64 subtitle from a success response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse(napiXml(MICRODVD)));
    global.fetch = fetchMock;
    const content = await fetchNapiprojektSubtitle("abc123");
    expect(content?.toString()).toBe(MICRODVD);
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("downloaded_subtitles_id")).toBe("abc123");
    expect(body.get("downloaded_subtitles_lang")).toBe("PL");
  });

  it("returns null when NapiProjekt has nothing for the hash", async () => {
    global.fetch = vi.fn().mockResolvedValue(textResponse(napiXml(null)));
    expect(await fetchNapiprojektSubtitle("abc123")).toBeNull();
  });
});

describe("downloadSubtitle", () => {
  it("saves a NapiProjekt hit next to the video, converted to SubRip", async () => {
    global.fetch = vi.fn().mockResolvedValue(textResponse(napiXml(MICRODVD)));
    const result = await downloadSubtitle({ filePath: videoPath });
    expect(result).toMatchObject({
      status: "downloaded",
      provider: "napiprojekt",
      hashMatch: true,
      fileName: "Movie (1999).srt",
      format: "microdvd",
      converted: true,
      cueCount: 2,
    });
    const written = fs.readFileSync(
      path.join(tmpDir, "Movie", "Movie (1999).srt"),
      "utf8",
    );
    expect(written).toContain("00:00:01,001 --> 00:00:02,002");
    expect(written).toContain("Wykryto ruch.");
  });

  it("leaves a movie that already has subtitles alone", async () => {
    fs.writeFileSync(path.join(tmpDir, "Movie", "Movie (1999).pl.srt"), "x");
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const result = await downloadSubtitle({ filePath: videoPath });
    expect(result.status).toBe("exists");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("overwrites existing subtitles when asked to replace", async () => {
    fs.writeFileSync(path.join(tmpDir, "Movie", "Movie (1999).srt"), "old");
    global.fetch = vi.fn().mockResolvedValue(textResponse(napiXml(MICRODVD)));
    const result = await downloadSubtitle({ filePath: videoPath }, { replace: true });
    expect(result.status).toBe("downloaded");
    expect(
      fs.readFileSync(path.join(tmpDir, "Movie", "Movie (1999).srt"), "utf8"),
    ).toContain("Wykryto ruch.");
  });

  it("reports not_found when NapiProjekt misses and OpenSubtitles is not configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse(napiXml(null)));
    global.fetch = fetchMock;
    expect(await downloadSubtitle({ filePath: videoPath })).toEqual({
      status: "not_found",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to OpenSubtitles by IMDb id, preferring a hash match", async () => {
    process.env.OPENSUBTITLES_API_KEY = "test-key";
    // The free API tier injects ads as their own cues at both ends.
    const srt = [
      "1\n00:00:00,500 --> 00:00:03,000\nAdvertise your product or brand here\ncontact www.OpenSubtitles.org today\n",
      "2\n00:00:04,000 --> 00:00:05,000\nCześć\n",
      "3\n01:30:00,000 --> 01:30:03,000\nSupport us and become VIP member\nto remove all ads from www.OpenSubtitles.org\n",
    ].join("\n");
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("napiprojekt")) return textResponse(napiXml(null));
      if (href.includes("/subtitles?")) {
        return Response.json({
          data: [
            { attributes: { download_count: 900, files: [{ file_id: 1 }] } },
            {
              attributes: {
                moviehash_match: true,
                download_count: 5,
                files: [{ file_id: 2 }],
              },
            },
          ],
        });
      }
      if (href.endsWith("/download")) {
        expect(JSON.parse(String(init?.body))).toEqual({ file_id: 2 });
        return Response.json({ link: "https://dl.example/sub.srt" });
      }
      if (href === "https://dl.example/sub.srt") return textResponse(srt);
      throw new Error(`unexpected fetch ${href}`);
    });
    global.fetch = fetchMock as typeof fetch;

    const result = await downloadSubtitle({
      filePath: videoPath,
      imdbId: "tt0133093",
      title: "Movie",
      year: 1999,
    });
    expect(result).toMatchObject({
      status: "downloaded",
      provider: "opensubtitles",
      hashMatch: true,
      cueCount: 1,
      adCuesRemoved: 2,
    });
    const written = fs.readFileSync(
      path.join(tmpDir, "Movie", "Movie (1999).srt"),
      "utf8",
    );
    expect(written).toBe("1\r\n00:00:04,000 --> 00:00:05,000\r\nCześć\r\n\r\n");

    const searchUrl = new URL(String(fetchMock.mock.calls[1][0]));
    // Parameters must arrive sorted, and the IMDb id without "tt" and zeros.
    expect([...searchUrl.searchParams.keys()]).toEqual([
      "imdb_id",
      "languages",
      "moviehash",
    ]);
    expect(searchUrl.searchParams.get("imdb_id")).toBe("133093");
    expect(searchUrl.searchParams.get("languages")).toBe("pl");
    const headers = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;
    expect(headers["Api-Key"]).toBe("test-key");
  });

  it("still tries OpenSubtitles when NapiProjekt is down", async () => {
    process.env.OPENSUBTITLES_API_KEY = "test-key";
    global.fetch = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes("napiprojekt")) return textResponse("oops", 503);
      if (href.includes("/subtitles?")) return Response.json({ data: [] });
      throw new Error(`unexpected fetch ${href}`);
    }) as typeof fetch;
    // OpenSubtitles answered (with nothing), so the outage is not the verdict.
    const result = await downloadSubtitle({ filePath: videoPath, title: "Movie" });
    expect(result).toEqual({ status: "error", error: "NapiProjekt HTTP 503" });
  });

  it("reports no_file when the video is gone", async () => {
    const result = await downloadSubtitle({
      filePath: path.join(tmpDir, "missing.avi"),
    });
    expect(result).toEqual({ status: "no_file" });
  });
});

describe("downloadMissingSubtitles", () => {
  const TEST_DB = path.join(__dirname, "test-subtitle-download.db");
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  function addMovie(title: string, filePath: string | null) {
    const id = insertMovie(db, {
      title,
      year: 1999,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "local",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(filePath, id);
    return id;
  }

  it("downloads for movies without subtitles and skips the rest", async () => {
    const otherVideo = path.join(tmpDir, "Other.mkv");
    fs.writeFileSync(otherVideo, Buffer.alloc(200 * 1024, 7));
    fs.writeFileSync(path.join(tmpDir, "Other.srt"), "existing");
    addMovie("A Movie", videoPath);
    addMovie("B Other", otherVideo);
    addMovie("C Metadata only", null);

    global.fetch = vi.fn().mockResolvedValue(textResponse(napiXml(MICRODVD)));
    const events: BulkSubtitleEvent[] = [];
    await downloadMissingSubtitles(db, (e) => events.push(e), { delayMs: 0 });

    expect(events[0]).toEqual({ type: "start", total: 2 });
    const progress = events.filter((e) => e.type === "progress");
    expect(progress.map((e) => [e.title, e.result.status])).toEqual([
      ["A Movie", "downloaded"],
      ["B Other", "exists"],
    ]);
    expect(events.at(-1)).toEqual({
      type: "done",
      downloaded: 1,
      notFound: 0,
      skipped: 1,
      errors: 0,
    });
  });
});
