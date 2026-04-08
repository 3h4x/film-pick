import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, insertMovie, getMovies, deleteMovie } from "@/lib/db";

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
