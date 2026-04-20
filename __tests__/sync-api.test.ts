import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, insertMovie } from "@/lib/db";

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

import { POST } from "@/app/api/sync/route";
import { getDb, setSetting } from "@/lib/db";
import { scanDirectoryGenerator } from "@/lib/scanner";
import { searchTmdb } from "@/lib/tmdb";

const TEST_DB = path.join(__dirname, "test-sync-api.db");

async function readNDJSON(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("sync API route", () => {
  let db: Database.Database;
  let existsSyncSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
    existsSyncSpy = vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(scanDirectoryGenerator).mockReturnValue((function* () {})());
    vi.mocked(searchTmdb).mockResolvedValue([]);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    existsSyncSpy.mockRestore();
    vi.resetAllMocks();
  });

  it("returns 400 when no library_path is configured", async () => {
    const res = await POST();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/library path/i);
  });

  it("returns 404 when library path does not exist on disk", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/missing/path');
    existsSyncSpy.mockReturnValue(false);

    const res = await POST();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("streams ndjson with scan_complete and complete events when no files found", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    vi.mocked(scanDirectoryGenerator).mockReturnValue((function* () {})());

    const res = await POST();
    expect(res.headers.get("content-type")).toBe("application/x-ndjson");

    const events = await readNDJSON(res);
    const complete = events.find((e) => e.type === "complete");
    expect(complete).toBeDefined();
    expect(complete!.added).toBe(0);
    expect(complete!.removed).toBe(0);
    expect(complete!.total).toBe(0);
  });

  it("adds new file via TMDb search when no existing match", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filename: "Inception.2010.mkv",
          filePath: "/movies/Inception.2010.mkv",
          parsedTitle: "Inception",
          parsedYear: 2010,
        };
      })(),
    );
    vi.mocked(searchTmdb).mockResolvedValue([
      {
        title: "Inception",
        year: 2010,
        genre: "Sci-Fi, Thriller",
        rating: 8.8,
        poster_url: null,
        imdb_id: "tt1375666",
        tmdb_id: 27205,
      },
    ]);

    const res = await POST();
    const events = await readNDJSON(res);

    const complete = events.find((e) => e.type === "complete");
    expect(complete!.added).toBe(1);
    expect(complete!.linked).toBe(0);

    const movies = db.prepare("SELECT * FROM movies").all() as { title: string }[];
    expect(movies).toHaveLength(1);
    expect(movies[0].title).toBe("Inception");
  });

  it("links file to existing movie with matching title+year and no file_path", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    insertMovie(db as unknown as ReturnType<typeof getDb>, {
      title: "Inception",
      year: 2010,
      genre: "Sci-Fi",
      director: null,
      rating: 8.8,
      poster_url: null,
      source: "filmweb",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filename: "Inception.2010.mkv",
          filePath: "/movies/Inception.2010.mkv",
          parsedTitle: "Inception",
          parsedYear: 2010,
        };
      })(),
    );

    const res = await POST();
    const events = await readNDJSON(res);

    const complete = events.find((e) => e.type === "complete");
    expect(complete!.linked).toBe(1);
    expect(complete!.added).toBe(0);
    expect(searchTmdb).not.toHaveBeenCalled();

    const movies = db.prepare("SELECT * FROM movies").all() as { file_path: string }[];
    expect(movies).toHaveLength(1);
    expect(movies[0].file_path).toBe("/movies/Inception.2010.mkv");
  });

  it("adds file as local entry when TMDb search returns no results", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filename: "UnknownFilm.2005.mkv",
          filePath: "/movies/UnknownFilm.2005.mkv",
          parsedTitle: "UnknownFilm",
          parsedYear: 2005,
        };
      })(),
    );
    vi.mocked(searchTmdb).mockResolvedValue([]);

    const res = await POST();
    const events = await readNDJSON(res);

    const complete = events.find((e) => e.type === "complete");
    expect(complete!.added).toBe(1);
    expect(complete!.failed).toBe(0);

    const movies = db.prepare("SELECT * FROM movies").all() as { source: string; title: string }[];
    expect(movies).toHaveLength(1);
    expect(movies[0].source).toBe("local");
    expect(movies[0].title).toBe("UnknownFilm");
  });

  it("adds file as local entry when TMDb search throws", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filename: "SomeFilm.2000.mkv",
          filePath: "/movies/SomeFilm.2000.mkv",
          parsedTitle: "SomeFilm",
          parsedYear: 2000,
        };
      })(),
    );
    vi.mocked(searchTmdb).mockRejectedValue(new Error("TMDb down"));

    const res = await POST();
    const events = await readNDJSON(res);

    const complete = events.find((e) => e.type === "complete");
    expect(complete!.added).toBe(1);
    expect(complete!.failed).toBe(1);
  });

  it("removes movies whose file_path no longer exists on disk", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    insertMovie(db as unknown as ReturnType<typeof getDb>, {
      title: "Old Film",
      year: 1999,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "local",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
      file_path: "/movies/OldFilm.1999.mkv",
    });

    // Scanner finds no files — the old file is gone
    vi.mocked(scanDirectoryGenerator).mockReturnValue((function* () {})());

    const res = await POST();
    const events = await readNDJSON(res);

    const complete = events.find((e) => e.type === "complete");
    expect(complete!.removed).toBe(1);

    const movies = db.prepare("SELECT * FROM movies").all();
    expect(movies).toHaveLength(0);
  });

  it("does not remove movies already in extra_files on rescan", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    db.prepare(
      "INSERT INTO movies (title, year, source, type, file_path, extra_files) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("Matrix", 1999, "tmdb", "movie", "/movies/Matrix.mkv", JSON.stringify(["/movies/Matrix.alt.mkv"]));

    // Scanner finds the primary file only
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filename: "Matrix.mkv",
          filePath: "/movies/Matrix.mkv",
          parsedTitle: "Matrix",
          parsedYear: 1999,
        };
      })(),
    );

    const res = await POST();
    const events = await readNDJSON(res);

    const complete = events.find((e) => e.type === "complete");
    // Primary file exists — movie should NOT be removed
    expect(complete!.removed).toBe(0);
  });

  it("emits scanning progress events during phase 1", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        for (let i = 0; i < 3; i++) {
          yield {
            filename: `Film${i}.mkv`,
            filePath: `/movies/Film${i}.mkv`,
            parsedTitle: `Film${i}`,
            parsedYear: 2000 + i,
          };
        }
      })(),
    );

    const res = await POST();
    const events = await readNDJSON(res);

    const scanningEvents = events.filter((e) => e.type === "scanning");
    expect(scanningEvents.length).toBeGreaterThanOrEqual(1);

    const scanComplete = events.find((e) => e.type === "scan_complete");
    expect(scanComplete).toBeDefined();
    expect(scanComplete!.total).toBe(3);
  });

  it("counts unchanged files correctly when all known", async () => {
    setSetting(db as unknown as ReturnType<typeof getDb>, 'library_path', '/movies');
    insertMovie(db as unknown as ReturnType<typeof getDb>, {
      title: "Known",
      year: 2000,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "local",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
      file_path: "/movies/Known.2000.mkv",
    });

    vi.mocked(scanDirectoryGenerator).mockReturnValue(
      (function* () {
        yield {
          filename: "Known.2000.mkv",
          filePath: "/movies/Known.2000.mkv",
          parsedTitle: "Known",
          parsedYear: 2000,
        };
      })(),
    );

    const res = await POST();
    const events = await readNDJSON(res);

    const scanComplete = events.find((e) => e.type === "scan_complete");
    expect(scanComplete!.unchanged).toBe(1);
    expect(scanComplete!.new_files).toBe(0);
  });
});
