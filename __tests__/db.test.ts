import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import {
  initDb,
  insertMovie,
  getMovies,
  deleteMovie,
  getCachedEngine,
  setCachedEngine,
  clearCachedEngine,
  dismissRecommendation,
  getDismissedIds,
  saveRecommendedMovies,
  getRecommendedMovies,
  updateRecommendedMovie,
} from "@/lib/db";

const TEST_DB = path.join(__dirname, "test.db");

describe("database", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("creates movies table with correct columns", () => {
    initDb(db);

    const info = db.pragma("table_info(movies)");
    const columns = (info as any[]).map((c: any) => c.name);
    expect(columns).toContain("id");
    expect(columns).toContain("title");
    expect(columns).toContain("year");
    expect(columns).toContain("genre");
    expect(columns).toContain("director");
    expect(columns).toContain("rating");
    expect(columns).toContain("poster_url");
    expect(columns).toContain("source");
    expect(columns).toContain("imdb_id");
    expect(columns).toContain("tmdb_id");
    expect(columns).toContain("type");
  });

  it("creates recommendation_cache table with correct columns", () => {
    initDb(db);

    const info = db.pragma("table_info(recommendation_cache)");
    const columns = (info as any[]).map((c: any) => c.name);
    expect(columns).toContain("engine");
    expect(columns).toContain("data");
    expect(columns).toContain("movie_count");
  });

  it("inserts and retrieves a movie", () => {
    initDb(db);

    insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: "Sci-Fi",
      director: "Christopher Nolan",
      rating: 8.8,
      poster_url: null,
      source: "tmdb",
      imdb_id: "tt1375666",
      tmdb_id: 27205,
      type: "movie",
    });

    const movies = getMovies(db);
    expect(movies).toHaveLength(1);
    expect(movies[0].title).toBe("Inception");
    expect(movies[0].year).toBe(2010);
  });

  it("deletes a movie by id", () => {
    initDb(db);

    insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: "Sci-Fi",
      director: "Christopher Nolan",
      rating: 8.8,
      poster_url: null,
      source: "tmdb",
      imdb_id: "tt1375666",
      tmdb_id: 27205,
      type: "movie",
    });

    const movies = getMovies(db);
    deleteMovie(db, movies[0].id);
    expect(getMovies(db)).toHaveLength(0);
  });
});

describe("recommendation cache", () => {
  let db: Database.Database;
  const TEST_DB = path.join(__dirname, "test-cache.db");

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("returns null for non-existent engine", () => {
    const result = getCachedEngine(db, "genre", 10);
    expect(result).toBeNull();
  });

  it("stores and retrieves cache for an engine", () => {
    const data = [{ tmdb_id: 329865, title: "Arrival" }];
    setCachedEngine(db, "genre", data, 5);
    const result = getCachedEngine(db, "genre", 5);
    expect(result).toEqual(data);
  });

  it("returns null when movie count differs from cached count", () => {
    setCachedEngine(db, "genre", [{ tmdb_id: 1, title: "Test" }], 5);
    expect(getCachedEngine(db, "genre", 10)).toBeNull();
  });

  it("replaces existing cache entry for same engine", () => {
    setCachedEngine(db, "genre", [{ tmdb_id: 1, title: "Old" }], 5);
    setCachedEngine(db, "genre", [{ tmdb_id: 2, title: "New" }], 5);
    const result = getCachedEngine(db, "genre", 5);
    expect(result).toEqual([{ tmdb_id: 2, title: "New" }]);
  });

  it("clears cache for a specific engine only", () => {
    setCachedEngine(db, "genre", [{ tmdb_id: 1 }], 5);
    setCachedEngine(db, "director", [{ tmdb_id: 2 }], 5);
    clearCachedEngine(db, "genre");
    expect(getCachedEngine(db, "genre", 5)).toBeNull();
    expect(getCachedEngine(db, "director", 5)).toEqual([{ tmdb_id: 2 }]);
  });

  it("clears all caches when no engine specified", () => {
    setCachedEngine(db, "genre", [{ tmdb_id: 1 }], 5);
    setCachedEngine(db, "director", [{ tmdb_id: 2 }], 5);
    clearCachedEngine(db);
    expect(getCachedEngine(db, "genre", 5)).toBeNull();
    expect(getCachedEngine(db, "director", 5)).toBeNull();
  });

  it("returns null when cached data is malformed JSON", () => {
    db.prepare(
      "INSERT OR REPLACE INTO recommendation_cache (engine, data, movie_count, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
    ).run("genre", "not-valid-json{{{", 5);
    const result = getCachedEngine(db, "genre", 5);
    expect(result).toBeNull();
  });
});

describe("dismissed recommendations", () => {
  let db: Database.Database;
  const TEST_DB = path.join(__dirname, "test-dismiss.db");

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("getDismissedIds returns empty set initially", () => {
    const dismissed = getDismissedIds(db);
    expect(dismissed.size).toBe(0);
  });

  it("dismissRecommendation adds tmdb_id to dismissed set", () => {
    dismissRecommendation(db, 12345);
    const dismissed = getDismissedIds(db);
    expect(dismissed.has(12345)).toBe(true);
  });

  it("dismissing multiple movies tracks all of them", () => {
    dismissRecommendation(db, 111);
    dismissRecommendation(db, 222);
    dismissRecommendation(db, 333);
    const dismissed = getDismissedIds(db);
    expect(dismissed.size).toBe(3);
    expect(dismissed.has(111)).toBe(true);
    expect(dismissed.has(222)).toBe(true);
    expect(dismissed.has(333)).toBe(true);
  });

  it("ignores duplicate dismissals without throwing", () => {
    dismissRecommendation(db, 12345);
    dismissRecommendation(db, 12345);
    const dismissed = getDismissedIds(db);
    expect(dismissed.size).toBe(1);
  });
});

describe("recommended movies", () => {
  let db: Database.Database;
  const TEST_DB = path.join(__dirname, "test-recommended.db");

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  const sampleMovie = {
    tmdb_id: 329865,
    title: "Arrival",
    year: 2016 as number | null,
    genre: "Sci-Fi" as string | null,
    rating: 7.9 as number | null,
    poster_url: null as string | null,
  };

  it("saves and retrieves recommended movies", () => {
    saveRecommendedMovies(db, "genre", "Because you love Sci-Fi", [sampleMovie]);
    const movies = getRecommendedMovies(db);
    expect(movies).toHaveLength(1);
    expect(movies[0].title).toBe("Arrival");
    expect(movies[0].engine).toBe("genre");
    expect(movies[0].reason).toBe("Because you love Sci-Fi");
    expect(movies[0].tmdb_id).toBe(329865);
  });

  it("retrieves recommended movies filtered by engine", () => {
    saveRecommendedMovies(db, "genre", "Sci-Fi fans", [sampleMovie]);
    saveRecommendedMovies(db, "director", "Nolan films", [
      { tmdb_id: 157336, title: "Interstellar", year: 2014, genre: "Sci-Fi", rating: 8.6, poster_url: null },
    ]);

    const genreMovies = getRecommendedMovies(db, "genre");
    expect(genreMovies).toHaveLength(1);
    expect(genreMovies[0].title).toBe("Arrival");

    const directorMovies = getRecommendedMovies(db, "director");
    expect(directorMovies).toHaveLength(1);
    expect(directorMovies[0].title).toBe("Interstellar");
  });

  it("ignores duplicate tmdb_id + engine combinations", () => {
    saveRecommendedMovies(db, "genre", "Sci-Fi fans", [sampleMovie]);
    saveRecommendedMovies(db, "genre", "Sci-Fi fans again", [sampleMovie]);
    expect(getRecommendedMovies(db, "genre")).toHaveLength(1);
  });

  it("allows same tmdb_id under different engines", () => {
    saveRecommendedMovies(db, "genre", "Sci-Fi fans", [sampleMovie]);
    saveRecommendedMovies(db, "director", "Villeneuve films", [sampleMovie]);
    expect(getRecommendedMovies(db)).toHaveLength(2);
  });

  it("updateRecommendedMovie updates pl_title", () => {
    saveRecommendedMovies(db, "genre", "Sci-Fi", [sampleMovie]);
    updateRecommendedMovie(db, 329865, { pl_title: "Nowy Przybytek" });
    const movies = getRecommendedMovies(db);
    expect(movies[0].pl_title).toBe("Nowy Przybytek");
  });

  it("updateRecommendedMovie updates cda_url", () => {
    saveRecommendedMovies(db, "genre", "Sci-Fi", [sampleMovie]);
    updateRecommendedMovie(db, 329865, { cda_url: "https://www.cda.pl/video/arrival" });
    const movies = getRecommendedMovies(db);
    expect(movies[0].cda_url).toBe("https://www.cda.pl/video/arrival");
  });
});
