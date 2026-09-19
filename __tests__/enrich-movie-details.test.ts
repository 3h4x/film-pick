import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, getMovies } from "@/lib/db";

vi.mock("@/lib/tmdb", () => ({
  getMovieLocalized: vi.fn(),
  getTmdbMovieDetails: vi.fn(),
}));

import { enrichMissingMovieDetails } from "@/lib/enrich-movie-details";
import { getMovieLocalized, getTmdbMovieDetails } from "@/lib/tmdb";

const TEST_DB = path.join(__dirname, "test-enrich-movie-details.db");

type Extra = {
  pl_title?: string;
  file_path?: string;
  cda_url?: string;
  genre?: string;
  checked?: number;
};

function addMovie(db: Database.Database, title: string, tmdbId: number | null, extra: Extra = {}) {
  return db
    .prepare(
      "INSERT INTO movies (title, year, tmdb_id, type, source, pl_title, file_path, cda_url, genre, tmdb_collection_checked) VALUES (?, 2026, ?, 'movie', 'tmdb', ?, ?, ?, ?, ?)",
    )
    .run(
      title,
      tmdbId,
      extra.pl_title ?? null,
      extra.file_path ?? null,
      extra.cda_url ?? null,
      extra.genre ?? null,
      extra.checked ?? 0,
    ).lastInsertRowid as number;
}

const DETAILS = {
  director: "Christopher Nolan",
  writer: "Christopher Nolan",
  actors: "Matt Damon, Tom Holland",
  tmdb_collection_checked: true,
};

const opts = { limit: 10, delayMs: 0 };

describe("enrichMissingMovieDetails", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getMovieLocalized).mockReset();
    vi.mocked(getTmdbMovieDetails).mockReset();
    vi.mocked(getMovieLocalized).mockResolvedValue({ pl_title: "Odyseja", description: "Opis" });
    vi.mocked(getTmdbMovieDetails).mockResolvedValue(DETAILS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("makes a synced film searchable by Polish title, director and cast", async () => {
    addMovie(db, "The Odyssey", 1, { file_path: "/x/odyssey.mp4" });
    for (const q of ["odyseja", "nolan", "holland"]) {
      expect(getMovies(db, undefined, q)).toHaveLength(0);
    }

    const result = await enrichMissingMovieDetails(db, opts);

    expect(result).toEqual({ checked: 1, updated: 1, failed: 0 });
    for (const q of ["odyseja", "nolan", "holland"]) {
      expect(getMovies(db, undefined, q).map((m) => m.title)).toEqual(["The Odyssey"]);
    }
  });

  it("only fetches the part that is missing", async () => {
    addMovie(db, "Has PL", 2, { pl_title: "Ma", checked: 0 });
    addMovie(db, "Has credits", 3, { checked: 1 });

    await enrichMissingMovieDetails(db, opts);

    // "Has PL" needs credits only; "Has credits" needs the Polish title only.
    expect(vi.mocked(getTmdbMovieDetails).mock.calls.map((c) => c[0])).toEqual([2]);
    expect(vi.mocked(getMovieLocalized).mock.calls.map((c) => c[0])).toEqual([3]);
  });

  it("skips complete rows, rows without a TMDb id and unresolved CDA pseudo ids", async () => {
    addMovie(db, "Done", 4, { pl_title: "Gotowy", checked: 1 });
    addMovie(db, "No id", null);
    addMovie(db, "Pseudo", 5, { cda_url: "https://cda.pl/x" });

    const result = await enrichMissingMovieDetails(db, opts);
    expect(result.checked).toBe(0);
    expect(getMovieLocalized).not.toHaveBeenCalled();
    expect(getTmdbMovieDetails).not.toHaveBeenCalled();
  });

  it("marks credits as fetched even when TMDb has none, and does not retry", async () => {
    const id = addMovie(db, "No credits", 6);
    vi.mocked(getTmdbMovieDetails).mockResolvedValue({
      director: null,
      writer: null,
      actors: null,
      tmdb_collection_checked: true,
    });

    await enrichMissingMovieDetails(db, opts);
    const row = db
      .prepare("SELECT tmdb_collection_checked AS c, director FROM movies WHERE id = ?")
      .get(id) as { c: number; director: string | null };
    expect(row.c).toBe(1);
    expect(row.director).toBeNull();

    expect((await enrichMissingMovieDetails(db, opts)).checked).toBe(0);
  });

  it("stores the original title when TMDb has no Polish one, so it is not retried", async () => {
    const id = addMovie(db, "Obscure", 7, { checked: 1 });
    vi.mocked(getMovieLocalized).mockResolvedValue({ pl_title: null, description: null });

    await enrichMissingMovieDetails(db, opts);
    const row = db.prepare("SELECT pl_title FROM movies WHERE id = ?").get(id) as { pl_title: string };
    expect(row.pl_title).toBe("Obscure");
    expect((await enrichMissingMovieDetails(db, opts)).checked).toBe(0);
  });

  it("stores collection info from the same details call", async () => {
    const id = addMovie(db, "Part 1", 8);
    vi.mocked(getTmdbMovieDetails).mockResolvedValue({
      ...DETAILS,
      tmdb_collection_id: 99,
      tmdb_collection_name: "Saga",
    });

    await enrichMissingMovieDetails(db, opts);
    const row = db
      .prepare("SELECT tmdb_collection_id AS id, tmdb_collection_name AS name FROM movies WHERE id = ?")
      .get(id) as { id: number; name: string };
    expect(row).toEqual({ id: 99, name: "Saga" });
  });

  it("leaves a part untouched on a TMDb error so the next run retries it", async () => {
    const id = addMovie(db, "Flaky", 9);
    vi.mocked(getTmdbMovieDetails).mockRejectedValue(new Error("429"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await enrichMissingMovieDetails(db, opts);
    expect(result).toEqual({ checked: 1, updated: 1, failed: 1 });
    const row = db
      .prepare("SELECT pl_title, tmdb_collection_checked AS c FROM movies WHERE id = ?")
      .get(id) as { pl_title: string; c: number };
    expect(row.pl_title).toBe("Odyseja"); // the localized half succeeded
    expect(row.c).toBe(0); // credits will be retried

    expect((await enrichMissingMovieDetails(db, opts)).checked).toBe(1);
  });

  it("does not mark a row as fetched when TMDb's details response was not ok", async () => {
    const id = addMovie(db, "Not ok", 10);
    vi.mocked(getTmdbMovieDetails).mockResolvedValue({ director: null, writer: null, actors: null });

    await enrichMissingMovieDetails(db, opts);
    const row = db.prepare("SELECT tmdb_collection_checked AS c FROM movies WHERE id = ?").get(id) as { c: number };
    expect(row.c).toBe(0);
  });

  it("handles files on disk first and respects the limit", async () => {
    addMovie(db, "No file", 11);
    addMovie(db, "On disk", 12, { file_path: "/x/a.mp4" });

    const result = await enrichMissingMovieDetails(db, { limit: 1, delayMs: 0 });
    expect(result.checked).toBe(1);
    expect(vi.mocked(getTmdbMovieDetails).mock.calls[0][0]).toBe(12);
  });
});
