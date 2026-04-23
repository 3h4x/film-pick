import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, getSetting } from "@/lib/db";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

vi.mock("@/lib/scanner", () => ({
  scanDirectoryGenerator: vi.fn(),
}));

vi.mock("@/lib/tmdb", () => ({
  searchTmdb: vi.fn(),
}));

import { POST } from "@/app/api/import/route";
import { getDb } from "@/lib/db";
import { scanDirectoryGenerator } from "@/lib/scanner";
import { searchTmdb } from "@/lib/tmdb";

const TEST_DB = path.join(__dirname, "test-import.db");

// Helper: collect all NDJSON lines from a streaming Response
async function readNDJSON(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/import", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("import API route", () => {
  let db: Database.Database;
  let existsSyncSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
    existsSyncSpy = vi.spyOn(fs, "existsSync").mockReturnValue(true);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    existsSyncSpy.mockRestore();
    vi.clearAllMocks();
  });

  // ── Input validation ────────────────────────────────────────────────────────

  it("returns 400 when path is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/path/i);
  });

  it("returns 400 when path is not a string", async () => {
    const res = await POST(makeRequest({ path: 42 }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when directory does not exist", async () => {
    existsSyncSpy.mockReturnValue(false);
    const res = await POST(makeRequest({ path: "/nonexistent/dir" }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/not found/i);
  });

  // ── Streaming behaviour ─────────────────────────────────────────────────────

  it("streams NDJSON with content-type application/x-ndjson", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {})() as ReturnType<typeof scanDirectoryGenerator>,
    );

    const res = await POST(makeRequest({ path: "/movies" }));
    expect(res.headers.get("content-type")).toBe("application/x-ndjson");
  });

  it("emits complete event with zero counts for an empty directory", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {})() as ReturnType<typeof scanDirectoryGenerator>,
    );

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete).toBeDefined();
    expect(complete!.added).toBe(0);
    expect(complete!.skipped).toBe(0);
    expect(complete!.failed).toBe(0);
    expect(complete!.total).toBe(0);
  });

  it("emits discovery and progress events for each file found", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Inception (2010)/inception.mkv",
          filename: "inception.mkv",
          parsedTitle: "Inception",
          parsedYear: 2010,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "Inception",
        year: 2010,
        genre: "Sci-Fi",
        rating: 8.8,
        poster_url: null,
        tmdb_id: 27205,
        imdb_id: null,
      },
    ]);

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const types = lines.map((l) => l.type);

    expect(types).toContain("discovery");
    expect(types).toContain("progress");
    expect(types).toContain("complete");
  });

  it("counts added=1 when TMDb match is found for a new file", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Inception (2010)/inception.mkv",
          filename: "inception.mkv",
          parsedTitle: "Inception",
          parsedYear: 2010,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "Inception",
        year: 2010,
        genre: "Sci-Fi",
        rating: 8.8,
        poster_url: null,
        tmdb_id: 27205,
        imdb_id: null,
      },
    ]);

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete!.added).toBe(1);
    expect(complete!.skipped).toBe(0);
    expect(complete!.failed).toBe(0);
  });

  it("counts added=1 with source=local when no TMDb match found", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Unknown Film (2099)/unknown.mkv",
          filename: "unknown.mkv",
          parsedTitle: "Unknown Film",
          parsedYear: 2099,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    vi.mocked(searchTmdb).mockResolvedValue([]);

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete!.added).toBe(1);
    expect(complete!.failed).toBe(0);
  });

  it("counts skipped=1 for a file that is already in the library", async () => {
    // Pre-insert the movie so it's already in the DB
    const { insertMovie } = await import("@/lib/db");
    insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: "Sci-Fi",
      director: null,
      rating: 8.8,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
      file_path: "/movies/Inception (2010)/inception.mkv",
    });

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Inception (2010)/inception.mkv",
          filename: "inception.mkv",
          parsedTitle: "Inception",
          parsedYear: 2010,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete!.skipped).toBe(1);
    expect(complete!.added).toBe(0);
  });

  it("counts failed=1 when TMDb throws an error", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Film (2020)/film.mkv",
          filename: "film.mkv",
          parsedTitle: "Film",
          parsedYear: 2020,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    vi.mocked(searchTmdb).mockRejectedValue(new Error("Network error"));

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete!.failed).toBe(1);
    expect(complete!.added).toBe(0);
  });

  // ── Year-proximity matching ─────────────────────────────────────────────────

  it("accepts a TMDb result whose year is within ±1 of parsedYear", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Dune (2021)/dune.mkv",
          filename: "dune.mkv",
          parsedTitle: "Dune",
          parsedYear: 2021,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    // TMDb returns year=2022 (1 off) — should still match
    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "Dune: Part One",
        year: 2022,
        genre: "Sci-Fi",
        rating: 8.0,
        poster_url: null,
        tmdb_id: 438631,
        imdb_id: null,
      },
    ]);

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete!.added).toBe(1);
    expect(complete!.failed).toBe(0);

    const row = db
      .prepare("SELECT title, year FROM movies WHERE tmdb_id = 438631")
      .get() as { title: string; year: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.title).toBe("Dune: Part One");
  });

  it("falls back to first TMDb result when no result matches parsedYear", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Alien (1979)/alien.mkv",
          filename: "alien.mkv",
          parsedTitle: "Alien",
          parsedYear: 1979,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    // Returns a result with year far off — should fall back to first result
    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "Alien: Covenant",
        year: 2017,
        genre: "Horror",
        rating: 6.4,
        poster_url: null,
        tmdb_id: 395992,
        imdb_id: null,
      },
    ]);

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete!.added).toBe(1);

    const row = db
      .prepare("SELECT tmdb_id FROM movies WHERE tmdb_id = 395992")
      .get() as { tmdb_id: number } | undefined;
    expect(row).toBeDefined();
  });

  it("accepts any TMDb result when parsedYear is null", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filePath: "/movies/Casablanca/casablanca.mkv",
          filename: "casablanca.mkv",
          parsedTitle: "Casablanca",
          parsedYear: null,
        };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "Casablanca",
        year: 1942,
        genre: "Drama, Romance",
        rating: 8.5,
        poster_url: null,
        tmdb_id: 289,
        imdb_id: "tt0034583",
      },
    ]);

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete!.added).toBe(1);

    const row = db
      .prepare("SELECT tmdb_id FROM movies WHERE tmdb_id = 289")
      .get() as { tmdb_id: number } | undefined;
    expect(row).toBeDefined();
  });

  // ── Settings persistence ────────────────────────────────────────────────────

  it("saves the import path as library_path in settings", async () => {
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {})() as ReturnType<typeof scanDirectoryGenerator>,
    );

    await POST(makeRequest({ path: "/movies/library" }));

    const stored = getSetting(db, "library_path");
    expect(stored).toBe("/movies/library");
  });

  // ── Multi-file summary ──────────────────────────────────────────────────────

  it("totals added + skipped + failed correctly across multiple files", async () => {
    const { insertMovie } = await import("@/lib/db");
    insertMovie(db, {
      title: "Already Here",
      year: 2000,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "local",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
      file_path: "/movies/already.mkv",
    });

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield { filePath: "/movies/already.mkv", filename: "already.mkv", parsedTitle: "Already Here", parsedYear: 2000 };
        yield { filePath: "/movies/new.mkv", filename: "new.mkv", parsedTitle: "New Film", parsedYear: 2023 };
        yield { filePath: "/movies/broken.mkv", filename: "broken.mkv", parsedTitle: "Broken", parsedYear: 2022 };
      })() as ReturnType<typeof scanDirectoryGenerator>,
    );

    vi.mocked(searchTmdb)
      .mockResolvedValueOnce([{ title: "New Film", year: 2023, genre: "Action", rating: 7.0, poster_url: null, tmdb_id: 999, imdb_id: null }])
      .mockRejectedValueOnce(new Error("timeout"));

    const res = await POST(makeRequest({ path: "/movies" }));
    const lines = await readNDJSON(res);
    const complete = lines.find((l) => l.type === "complete");

    expect(complete!.total).toBe(3);
    expect(complete!.skipped).toBe(1);
    expect(complete!.added).toBe(1);
    expect(complete!.failed).toBe(1);
  });
});
