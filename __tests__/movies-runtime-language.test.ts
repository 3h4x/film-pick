import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, getMovies, updateMovieTmdbMetadata, type TmdbMetadataUpdate } from "@/lib/db";
import type { Movie } from "@/lib/types";
import { extractLanguages, filterMovies, matchesRuntimeFilter } from "@/lib/utils";
import { parseLibraryViewPrefs } from "@/lib/library-view-prefs";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { GET } from "@/app/api/movies/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-runtime-language.db");

function addMovie(
  db: Database.Database,
  title: string,
  runtime: number | null,
  language: string | null,
  tmdbId: number | null = null,
): number {
  return db
    .prepare(
      "INSERT INTO movies (title, year, type, source, tmdb_id, runtime, original_language) VALUES (?, 2000, 'movie', 'tmdb', ?, ?, ?)",
    )
    .run(title, tmdbId, runtime, language).lastInsertRowid as number;
}

function metadata(over: Partial<TmdbMetadataUpdate> = {}): TmdbMetadataUpdate {
  return {
    title: "Sample Movie",
    year: 1999,
    genre: "Drama",
    director: null,
    writer: null,
    actors: null,
    rating: 7,
    poster_url: null,
    imdb_id: null,
    ...over,
  };
}

describe("runtime and original_language", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
  });

  describe("migration", () => {
    it("adds runtime INTEGER and original_language TEXT to movies", () => {
      const cols = db.pragma("table_info(movies)") as { name: string; type: string }[];
      expect(cols.find((c) => c.name === "runtime")?.type).toBe("INTEGER");
      expect(cols.find((c) => c.name === "original_language")?.type).toBe("TEXT");
    });

    it("marks TMDb movies for a refresh once, so the next sync backfills them", () => {
      const movieId = addMovie(db, "Sample Movie", null, null, 101);
      const tvId = db
        .prepare(
          "INSERT INTO movies (title, type, tmdb_id, tmdb_refreshed_at) VALUES ('Sample Show', 'tv', 102, 1000)",
        )
        .run().lastInsertRowid;
      db.prepare("UPDATE movies SET tmdb_refreshed_at = 1000").run();
      // Pretend the database predates the migration.
      db.prepare("DELETE FROM _migrations WHERE name = 'add_runtime_original_language'").run();

      initDb(db);

      const refreshedAt = (id: number | bigint) =>
        (db.prepare("SELECT tmdb_refreshed_at AS t FROM movies WHERE id = ?").get(id) as { t: number | null }).t;
      expect(refreshedAt(movieId)).toBeNull();
      expect(refreshedAt(tvId)).toBe(1000);

      // Already applied: a second start leaves the timestamps alone.
      db.prepare("UPDATE movies SET tmdb_refreshed_at = 2000").run();
      initDb(db);
      expect(refreshedAt(movieId)).toBe(2000);
    });
  });

  describe("updateMovieTmdbMetadata", () => {
    it("stores runtime and original language from TMDb", () => {
      const id = addMovie(db, "Sample Movie", null, null, 101);
      const movie = updateMovieTmdbMetadata(db, id, metadata({ runtime: 118, original_language: "fr" }));
      expect(movie).toMatchObject({ runtime: 118, original_language: "fr" });
    });

    it("fill-only (sync) keeps values that are already stored", () => {
      const id = addMovie(db, "Sample Movie", 95, "pl", 101);
      const movie = updateMovieTmdbMetadata(
        db,
        id,
        metadata({ runtime: 118, original_language: "fr" }),
        undefined,
        { fillOnly: true },
      );
      expect(movie).toMatchObject({ runtime: 95, original_language: "pl" });
    });

    it("a full refresh without the values does not erase stored ones", () => {
      const id = addMovie(db, "Sample Movie", 95, "pl", 101);
      const movie = updateMovieTmdbMetadata(db, id, metadata());
      expect(movie).toMatchObject({ runtime: 95, original_language: "pl" });
    });
  });

  describe("getMovies filters", () => {
    beforeEach(() => {
      addMovie(db, "Short English", 85, "en");
      addMovie(db, "Long English", 150, "en");
      addMovie(db, "Short Polish", 90, "pl");
      addMovie(db, "Unknown Runtime", null, "en");
    });

    const titles = (movies: { title: string }[]) => movies.map((m) => m.title).sort();

    it("maxRuntime keeps known runtimes at or under the limit and drops unknown ones", () => {
      expect(titles(getMovies(db, undefined, undefined, { maxRuntime: 90 }))).toEqual([
        "Short English",
        "Short Polish",
      ]);
    });

    it("language matches original_language exactly", () => {
      expect(titles(getMovies(db, undefined, undefined, { language: "pl" }))).toEqual(["Short Polish"]);
    });

    it("combines with each other and with the full-text search", () => {
      expect(titles(getMovies(db, undefined, undefined, { maxRuntime: 120, language: "en" }))).toEqual([
        "Short English",
      ]);
      expect(titles(getMovies(db, undefined, "english", { maxRuntime: 120 }))).toEqual(["Short English"]);
    });
  });

  describe("GET /api/movies", () => {
    beforeEach(() => {
      addMovie(db, "Short English", 85, "en");
      addMovie(db, "Long Polish", 150, "pl");
      addMovie(db, "Unknown Runtime", null, "en");
    });

    async function get(search: string) {
      return GET(new NextRequest(`http://localhost/api/movies${search}`));
    }

    it("?max_runtime=90 returns only movies with a known runtime of at most 90 minutes", async () => {
      const res = await get("?max_runtime=90");
      expect(res.status).toBe(200);
      expect((await res.json()).map((m: Movie) => m.title)).toEqual(["Short English"]);
    });

    it("?language=pl returns only Polish-language movies", async () => {
      const res = await get("?language=PL");
      expect((await res.json()).map((m: Movie) => m.title)).toEqual(["Long Polish"]);
    });

    it("rejects an invalid max_runtime or language with 400", async () => {
      for (const search of ["?max_runtime=abc", "?max_runtime=0", "?max_runtime=9.5", "?language=english", "?language=e1"]) {
        const res = await get(search);
        expect(res.status, search).toBe(400);
      }
    });

    it("treats empty parameters as no filter", async () => {
      const res = await get("?max_runtime=&language=");
      expect(await res.json()).toHaveLength(3);
    });
  });
});

describe("library runtime and language filters", () => {
  const movie = (id: number, runtime: number | null, language: string | null): Movie => ({
    id,
    title: `Sample Movie ${id}`,
    year: 2000,
    genre: null,
    director: null,
    writer: null,
    actors: null,
    rating: null,
    user_rating: null,
    poster_url: null,
    source: "tmdb",
    type: "movie",
    rated_at: null,
    created_at: "2026-01-01",
    runtime,
    original_language: language,
  });

  it("buckets runtimes: under 90, 90–120 inclusive, over 120; unknown matches none", () => {
    expect(matchesRuntimeFilter(89, "short")).toBe(true);
    expect(matchesRuntimeFilter(90, "short")).toBe(false);
    expect(matchesRuntimeFilter(90, "medium")).toBe(true);
    expect(matchesRuntimeFilter(120, "medium")).toBe(true);
    expect(matchesRuntimeFilter(121, "long")).toBe(true);
    expect(matchesRuntimeFilter(null, "short")).toBe(false);
    expect(matchesRuntimeFilter(null, "")).toBe(true);
  });

  it("filterMovies applies the runtime bucket and language", () => {
    const movies = [movie(1, 85, "en"), movie(2, 100, "en"), movie(3, 100, "pl"), movie(4, null, "en")];
    expect(filterMovies(movies, { runtimeFilter: "medium" }).map((m) => m.id)).toEqual([2, 3]);
    expect(filterMovies(movies, { languageFilter: "en" }).map((m) => m.id)).toEqual([1, 2, 4]);
    expect(filterMovies(movies, { runtimeFilter: "medium", languageFilter: "pl" }).map((m) => m.id)).toEqual([3]);
  });

  it("lists library languages, most common first", () => {
    const movies = [movie(1, null, "pl"), movie(2, null, "en"), movie(3, null, "en"), movie(4, null, null)];
    expect(extractLanguages(movies)).toEqual(["en", "pl"]);
  });

  it("remembers valid runtime and language filters and drops invalid runtime values", () => {
    expect(parseLibraryViewPrefs(JSON.stringify({ runtimeFilter: "long", languageFilter: "pl" }))).toEqual({
      runtimeFilter: "long",
      languageFilter: "pl",
    });
    expect(parseLibraryViewPrefs(JSON.stringify({ runtimeFilter: "epic" }))).toEqual({});
  });
});
