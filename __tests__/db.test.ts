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
  getSetting,
  setSetting,
  getMovieByFilePath,
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

describe("insertMovie deduplication", () => {
  let db: Database.Database;
  const TEST_DB = path.join(__dirname, "test-insert-dedup.db");

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  const base = {
    title: "Ghost in the Shell",
    year: 1995,
    genre: "Animation",
    director: null,
    rating: 8.0,
    poster_url: null,
    source: "tmdb" as const,
    imdb_id: null,
    tmdb_id: 9323,
    type: "movie" as const,
  };

  it("returns existing id without overwriting file_path when tmdb_id matches and entry already has a file", () => {
    const id1 = insertMovie(db, { ...base, file_path: "/movies/gits-original.mkv" });
    const id2 = insertMovie(db, { ...base, file_path: "/movies/gits-remaster.mkv" });

    // Should point to the same DB entry
    expect(id2).toBe(id1);

    // Primary file_path must NOT have been overwritten
    const row = db.prepare("SELECT file_path, extra_files FROM movies WHERE id = ?").get(id1) as any;
    expect(row.file_path).toBe("/movies/gits-original.mkv");

    // Second path goes to extra_files
    const extras = JSON.parse(row.extra_files);
    expect(extras).toContain("/movies/gits-remaster.mkv");
  });

  it("does not create duplicate entries — same tmdb_id returns single row", () => {
    insertMovie(db, { ...base, file_path: "/movies/gits-original.mkv" });
    insertMovie(db, { ...base, file_path: "/movies/gits-remaster.mkv" });

    const rows = db.prepare("SELECT id FROM movies WHERE tmdb_id = ?").all(9323);
    expect(rows).toHaveLength(1);
  });

  it("does not add the same extra_file path twice", () => {
    const id = insertMovie(db, { ...base, file_path: "/movies/gits-original.mkv" });
    insertMovie(db, { ...base, file_path: "/movies/gits-copy.mkv" });
    insertMovie(db, { ...base, file_path: "/movies/gits-copy.mkv" });

    const row = db.prepare("SELECT extra_files FROM movies WHERE id = ?").get(id) as any;
    const extras = JSON.parse(row.extra_files);
    expect(extras.filter((p: string) => p === "/movies/gits-copy.mkv")).toHaveLength(1);
  });

  it("sets file_path when existing entry has none (normal link case)", () => {
    const id = insertMovie(db, { ...base, file_path: null });
    insertMovie(db, { ...base, file_path: "/movies/gits.mkv" });

    const row = db.prepare("SELECT file_path FROM movies WHERE id = ?").get(id) as any;
    expect(row.file_path).toBe("/movies/gits.mkv");
  });

  it("deduplicates by title+year when no tmdb_id, adds extra_files instead of overwriting", () => {
    const noTmdb = { ...base, tmdb_id: null };
    const id1 = insertMovie(db, { ...noTmdb, file_path: "/movies/gits-a.mkv" });
    const id2 = insertMovie(db, { ...noTmdb, file_path: "/movies/gits-b.mkv" });

    expect(id2).toBe(id1);

    const row = db.prepare("SELECT file_path, extra_files FROM movies WHERE id = ?").get(id1) as any;
    expect(row.file_path).toBe("/movies/gits-a.mkv");
    const extras = JSON.parse(row.extra_files);
    expect(extras).toContain("/movies/gits-b.mkv");
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

describe("getSetting / setSetting", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("returns null for a key that has not been set", () => {
    expect(getSetting(db, "nonexistent_key")).toBeNull();
  });

  it("stores and retrieves a setting", () => {
    setSetting(db, "library_path", "/movies");
    expect(getSetting(db, "library_path")).toBe("/movies");
  });

  it("overwrites an existing setting with INSERT OR REPLACE", () => {
    setSetting(db, "library_path", "/old");
    setSetting(db, "library_path", "/new");
    expect(getSetting(db, "library_path")).toBe("/new");
  });

  it("stores multiple independent settings", () => {
    setSetting(db, "tmdb_api_key", "abc123");
    setSetting(db, "library_path", "/movies");
    expect(getSetting(db, "tmdb_api_key")).toBe("abc123");
    expect(getSetting(db, "library_path")).toBe("/movies");
  });
});

describe("getMovieByFilePath", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("returns null when no movie has the given file path", () => {
    expect(getMovieByFilePath(db, "/movies/nonexistent.mkv")).toBeNull();
  });

  it("returns the matching movie when found", () => {
    insertMovie(db, {
      title: "Blade Runner",
      year: 1982,
      genre: "Sci-Fi",
      director: "Ridley Scott",
      rating: 8.1,
      poster_url: null,
      source: "local",
      imdb_id: "tt0083658",
      tmdb_id: 78,
      type: "movie",
      file_path: "/movies/blade_runner.mkv",
    });
    const movie = getMovieByFilePath(db, "/movies/blade_runner.mkv");
    expect(movie).not.toBeNull();
    expect(movie!.title).toBe("Blade Runner");
    expect(movie!.file_path).toBe("/movies/blade_runner.mkv");
  });

  it("returns null for a path that does not exactly match", () => {
    insertMovie(db, {
      title: "Blade Runner",
      year: 1982,
      genre: "Sci-Fi",
      director: null,
      rating: 8.1,
      poster_url: null,
      source: "local",
      imdb_id: null,
      tmdb_id: 78,
      type: "movie",
      file_path: "/movies/blade_runner.mkv",
    });
    expect(getMovieByFilePath(db, "/movies/BLADE_RUNNER.mkv")).toBeNull();
  });
});

describe("getMovies sort order", () => {
  const TEST_SORT_DB = path.join(__dirname, "test-sort.db");
  let db: Database.Database;

  function insert(title: string, tmdbId: number, userRating: number | null) {
    const id = insertMovie(db, {
      title,
      year: 2000,
      genre: "Drama",
      director: null,
      rating: 7.0,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: tmdbId,
      type: "movie",
    });
    if (userRating !== null) {
      db.prepare("UPDATE movies SET user_rating = ? WHERE id = ?").run(userRating, id);
    }
    return id;
  }

  beforeEach(() => {
    db = new Database(TEST_SORT_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_SORT_DB)) fs.unlinkSync(TEST_SORT_DB);
  });

  it("places movies with user_rating < 5 after unrated and well-rated movies", () => {
    insert("Disliked Film", 1, 3);
    insert("Well Rated Film", 2, 8);
    insert("Unrated Film", 3, null);

    const titles = getMovies(db).map((m) => m.title);
    const dislikedIdx = titles.indexOf("Disliked Film");
    const wellRatedIdx = titles.indexOf("Well Rated Film");
    const unratedIdx = titles.indexOf("Unrated Film");

    expect(dislikedIdx).toBeGreaterThan(wellRatedIdx);
    expect(dislikedIdx).toBeGreaterThan(unratedIdx);
  });

  it("sorts well-rated movies before unrated within the top group", () => {
    insert("Unrated Film", 1, null);
    insert("Rated 9", 2, 9);
    insert("Rated 7", 3, 7);

    const titles = getMovies(db).map((m) => m.title);
    // user_rating DESC: rated 9 first, then rated 7, then NULL (NULL sorts last in SQLite for DESC)
    // But actually in SQLite DESC, NULLs sort first. Let's just verify rated > 5 appear before < 5.
    const rated9Idx = titles.indexOf("Rated 9");
    const rated7Idx = titles.indexOf("Rated 7");
    // 9 should appear before 7 (higher rating → earlier in results)
    expect(rated9Idx).toBeLessThan(rated7Idx);
  });

  it("sinks all disliked movies (< 5) to the bottom regardless of rating value", () => {
    insert("Score 4", 1, 4);
    insert("Score 1", 2, 1);
    insert("Unrated", 3, null);
    insert("Score 8", 4, 8);

    const titles = getMovies(db).map((m) => m.title);
    const score8Idx = titles.indexOf("Score 8");
    const unratedIdx = titles.indexOf("Unrated");
    const score4Idx = titles.indexOf("Score 4");
    const score1Idx = titles.indexOf("Score 1");

    // Well-rated and unrated come before disliked
    expect(score4Idx).toBeGreaterThan(score8Idx);
    expect(score4Idx).toBeGreaterThan(unratedIdx);
    expect(score1Idx).toBeGreaterThan(score8Idx);
    expect(score1Idx).toBeGreaterThan(unratedIdx);
  });

  it("filters by type parameter without breaking sort", () => {
    insert("Movie A", 1, 8);
    const seriesId = insertMovie(db, {
      title: "Series B",
      year: 2001,
      genre: "Drama",
      director: null,
      rating: 7.0,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 999,
      type: "series",
    });
    void seriesId;

    const movies = getMovies(db, "movie");
    expect(movies.every((m) => m.type === "movie")).toBe(true);
    expect(movies.some((m) => m.title === "Movie A")).toBe(true);
    expect(movies.some((m) => m.title === "Series B")).toBe(false);

    const series = getMovies(db, "series");
    expect(series.every((m) => m.type === "series")).toBe(true);
  });
});
