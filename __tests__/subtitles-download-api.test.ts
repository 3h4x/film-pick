import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { initDb, insertMovie, setSetting } from "@/lib/db";

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

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { POST } from "@/app/api/movies/[id]/subtitles/download/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-subtitles-download-api.db");
const SRT = "1\n00:00:01,000 --> 00:00:02,000\nCześć\n";
const NAPI_HIT = `<result><status>success</status><subtitles><content><![CDATA[${Buffer.from(SRT).toString("base64")}]]></content></subtitles></result>`;

describe("POST /api/movies/[id]/subtitles/download", () => {
  let db: Database.Database;
  let tmpDir: string;
  let videoPath: string;
  let movieId: number;
  const originalFetch = global.fetch;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    setSetting(db, "subtitle_language", "pl");
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "filmpick-subs-api-"));
    videoPath = path.join(tmpDir, "Film.mkv");
    fs.writeFileSync(videoPath, Buffer.alloc(200 * 1024, 3));
    movieId = insertMovie(db, {
      title: "Film",
      year: 1985,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "local",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      videoPath,
      movieId,
    );
    global.fetch = vi.fn().mockResolvedValue(new Response(NAPI_HIT));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function call(id: number, query = "") {
    return POST(
      new NextRequest(
        `http://localhost/api/movies/${id}/subtitles/download${query}`,
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: String(id) }) },
    );
  }

  it("rejects unsupported languages before downloading", async () => {
    expect((await call(movieId, "?language=xx")).status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("uses English by default when no preference has been saved", async () => {
    db.prepare("DELETE FROM settings WHERE key = 'subtitle_language'").run();
    const previous = process.env.OPENSUBTITLES_API_KEY;
    delete process.env.OPENSUBTITLES_API_KEY;
    try {
      const res = await call(movieId);
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe("No English subtitles found");
      expect(global.fetch).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.OPENSUBTITLES_API_KEY;
      else process.env.OPENSUBTITLES_API_KEY = previous;
    }
  });

  it("lets the download choice override the saved language", async () => {
    setSetting(db, "subtitle_language", "en");
    expect((await call(movieId, "?language=pl")).status).toBe(200);
    expect(fs.existsSync(path.join(tmpDir, "Film.pl.srt"))).toBe(true);
  });

  it("404s for an unknown movie", async () => {
    expect((await call(99999)).status).toBe(404);
  });

  it("downloads and returns the saved track", async () => {
    const res = await call(movieId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      provider: "napiprojekt",
      fileName: "Film.pl.srt",
      path: path.join(tmpDir, "Film.pl.srt"),
    });
    expect(fs.existsSync(path.join(tmpDir, "Film.pl.srt"))).toBe(true);
  });

  it("409s when subtitles exist, unless replace=1", async () => {
    fs.writeFileSync(path.join(tmpDir, "Film.pl.srt"), "old");
    expect((await call(movieId)).status).toBe(409);
    const res = await call(movieId, "?replace=1");
    expect(res.status).toBe(200);
    expect(fs.readFileSync(path.join(tmpDir, "Film.pl.srt"), "utf8")).toContain(
      "Cześć",
    );
  });

  it("404s with a clear message when no provider has subtitles", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("<result></result>"));
    const res = await call(movieId);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("No Polish subtitles found");
  });
});
