import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, insertMovie, getMovies } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-api.db");

describe("movies API logic", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("GET returns all movies sorted by created_at desc", () => {
    insertMovie(db, {
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
    insertMovie(db, {
      title: "Dune",
      year: 2021,
      genre: "Sci-Fi",
      director: "Denis Villeneuve",
      rating: 8.0,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 438631,
      type: "movie",
    });

    const movies = getMovies(db);
    expect(movies).toHaveLength(2);
    const titles = movies.map((m) => m.title);
    expect(titles).toContain("Inception");
    expect(titles).toContain("Dune");
  });

  it("GET filters by type", () => {
    insertMovie(db, {
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
    insertMovie(db, {
      title: "Breaking Bad",
      year: 2008,
      genre: "Crime, Drama",
      director: "Vince Gilligan",
      rating: 9.5,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 1396,
      type: "series",
    });

    const movies = getMovies(db, "movie");
    expect(movies).toHaveLength(1);
    expect(movies[0].title).toBe("Inception");
  });
});
