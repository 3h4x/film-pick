import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, insertMovie, getMovies, getMovieByFilePath } from "@/lib/db";
import { parseFilename } from "@/lib/utils";

const TEST_DB = path.join(__dirname, "test-sync.db");

describe("sync: insertMovie deduplication", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("links file_path to existing movie with same title+year when file_path is null", () => {
    // Simulate Filmweb import (no file_path)
    insertMovie(db, {
      title: "The Shining",
      year: 1980,
      genre: "Horror",
      director: "Stanley Kubrick",
      rating: 8.4,
      poster_url: null,
      source: "filmweb",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    // Simulate sync finding the file and inserting with same title+year
    const filePath = "/Volumes/video/Movies/The Shining (1980)/The.Shining.1980.mkv";
    insertMovie(db, {
      title: "The Shining",
      year: 1980,
      genre: "Horror",
      director: null,
      rating: 8.4,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 694,
      type: "movie",
      file_path: filePath,
    });

    const movies = getMovies(db);
    expect(movies).toHaveLength(1);
    expect(movies[0].title).toBe("The Shining");
    expect(movies[0].file_path).toBe(filePath);
    // Original source preserved
    expect(movies[0].source).toBe("filmweb");
  });

  it("does not create duplicate when file_path already exists", () => {
    const filePath = "/Volumes/video/Movies/Inception/Inception.2010.mp4";
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
      file_path: filePath,
    });

    // Insert again with same file_path
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
      file_path: filePath,
    });

    expect(getMovies(db)).toHaveLength(1);
  });

  it("updates file_path on existing movie with same title+year even if it already has a different file_path", () => {
    const oldPath = "/Volumes/video/Movies/Matrix/Matrix.1999.avi";
    insertMovie(db, {
      title: "The Matrix",
      year: 1999,
      genre: "Sci-Fi",
      director: null,
      rating: 8.7,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 603,
      type: "movie",
      file_path: oldPath,
    });

    const newPath = "/Volumes/video/Movies/The Matrix (1999)/The.Matrix.1999.1080p.mkv";
    insertMovie(db, {
      title: "The Matrix",
      year: 1999,
      genre: "Sci-Fi",
      director: null,
      rating: 8.7,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 603,
      type: "movie",
      file_path: newPath,
    });

    const movies = getMovies(db);
    expect(movies).toHaveLength(1);
    expect(movies[0].file_path).toBe(newPath);
  });

  it("getMovieByFilePath returns movie when file_path matches", () => {
    const filePath = "/Volumes/video/Movies/Inception/Inception.mp4";
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
      file_path: filePath,
    });

    const found = getMovieByFilePath(db, filePath);
    expect(found).toBeTruthy();
    expect(found!.title).toBe("Inception");

    const notFound = getMovieByFilePath(db, "/nonexistent/path.mp4");
    expect(notFound).toBeNull();
  });

  it("allows different movies with same title but different years", () => {
    insertMovie(db, {
      title: "The Thing",
      year: 1982,
      genre: "Horror",
      director: null,
      rating: 8.1,
      poster_url: null,
      source: "filmweb",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    insertMovie(db, {
      title: "The Thing",
      year: 2011,
      genre: "Horror",
      director: null,
      rating: 6.2,
      poster_url: null,
      source: "filmweb",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    const movies = getMovies(db);
    expect(movies).toHaveLength(2);
    const years = movies.map(m => m.year).sort();
    expect(years).toEqual([1982, 2011]);
  });
});

describe("sync: parseFilename for sync matching", () => {
  it("parses standard release filename", () => {
    const result = parseFilename("The.Thing.1982.BluRay.720p.x264.YIFY.mkv");
    expect(result.title.toLowerCase()).toContain("thing");
    expect(result.year).toBe(1982);
  });

  it("parses filename with year in parentheses", () => {
    const result = parseFilename("The Shining (1980).mkv");
    expect(result.title).toContain("Shining");
    expect(result.year).toBe(1980);
  });

  it("parses filename with year in brackets", () => {
    const result = parseFilename("Rejs [1970].mkv");
    expect(result.title).toContain("Rejs");
    expect(result.year).toBe(1970);
  });

  it("parses filename starting with number", () => {
    const result = parseFilename("12.Monkeys.1995.BluRay.x264.720p.YIFY.mp4");
    expect(result.title).toContain("12");
    expect(result.title.toLowerCase()).toContain("monkeys");
    expect(result.year).toBe(1995);
  });

  it("parses filename with no year", () => {
    const result = parseFilename("whiplash.mp4");
    expect(result.title.toLowerCase()).toContain("whiplash");
    expect(result.year).toBeNull();
  });

  it("handles special characters in title", () => {
    const result = parseFilename("Dalí & Disney A Date with Destino [2010].avi");
    expect(result.title).toContain("Dal");
    expect(result.year).toBe(2010);
  });
});
