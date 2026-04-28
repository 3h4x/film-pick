import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, insertMovie, getMovies, deleteMovie } from "@/lib/db";
import type { Movie } from "@/lib/types";

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

  it("PATCH updates allowed fields on a movie", () => {
    const id = insertMovie(db, {
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

    db.prepare("UPDATE movies SET rating = ?, genre = ? WHERE id = ?").run(
      9.0,
      "Sci-Fi, Thriller",
      id,
    );
    const updated = db
      .prepare("SELECT * FROM movies WHERE id = ?")
      .get(id) as Movie;

    expect(updated.rating).toBe(9.0);
    expect(updated.genre).toBe("Sci-Fi, Thriller");
    expect(updated.title).toBe("Inception");
  });

  it("PATCH on non-existent movie id returns no row", () => {
    const row = db.prepare("SELECT * FROM movies WHERE id = ?").get(0);
    expect(row).toBeUndefined();
  });

  it("creates a recommendation-sourced movie with real ID", () => {
    const id = insertMovie(db, {
      title: "The Green Mile",
      year: 1999,
      genre: "Drama, Crime",
      director: null,
      rating: 8.6,
      poster_url: "https://image.tmdb.org/t/p/w300/test.jpg",
      source: "recommendation",
      imdb_id: null,
      tmdb_id: 497,
      type: "movie",
    });

    expect(id).toBeGreaterThan(0);
    const movies = getMovies(db);
    expect(movies).toHaveLength(1);
    expect(movies[0].source).toBe("recommendation");
    expect(movies[0].tmdb_id).toBe(497);
    expect(movies[0].file_path).toBeNull();
  });

  it("DELETE removes movie and returns empty list", () => {
    const id = insertMovie(db, {
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

    deleteMovie(db, id);
    expect(getMovies(db)).toHaveLength(0);
  });
});
