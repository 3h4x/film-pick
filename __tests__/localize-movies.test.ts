import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, getMovies } from "@/lib/db";

vi.mock("@/lib/tmdb", () => ({ getMovieLocalized: vi.fn() }));

import { enrichMissingLocalizedTitles } from "@/lib/localize-movies";
import { getMovieLocalized } from "@/lib/tmdb";

const TEST_DB = path.join(__dirname, "test-localize-movies.db");

function addMovie(
  db: Database.Database,
  title: string,
  tmdbId: number | null,
  extra: { pl_title?: string; file_path?: string; cda_url?: string; genre?: string } = {},
) {
  return db
    .prepare(
      "INSERT INTO movies (title, year, tmdb_id, type, source, pl_title, file_path, cda_url, genre) VALUES (?, 2026, ?, 'movie', 'tmdb', ?, ?, ?, ?)",
    )
    .run(
      title,
      tmdbId,
      extra.pl_title ?? null,
      extra.file_path ?? null,
      extra.cda_url ?? null,
      extra.genre ?? null,
    ).lastInsertRowid as number;
}

describe("enrichMissingLocalizedTitles", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getMovieLocalized).mockReset();
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("makes a synced film searchable by its Polish title", async () => {
    addMovie(db, "The Odyssey", 1, { file_path: "/x/odyssey.mp4" });
    expect(getMovies(db, undefined, "odyseja")).toHaveLength(0);

    vi.mocked(getMovieLocalized).mockResolvedValue({
      pl_title: "Odyseja",
      description: "Opis",
    });
    const result = await enrichMissingLocalizedTitles(db, { limit: 10, delayMs: 0 });

    expect(result).toEqual({ checked: 1, updated: 1, failed: 0 });
    expect(getMovies(db, undefined, "odyseja").map((m) => m.title)).toEqual(["The Odyssey"]);
  });

  it("skips rows that already have a Polish title, no TMDb id, or an unresolved CDA pseudo id", async () => {
    addMovie(db, "Has PL", 2, { pl_title: "Ma" });
    addMovie(db, "No id", null);
    addMovie(db, "Pseudo", 3, { cda_url: "https://cda.pl/x" });
    vi.mocked(getMovieLocalized).mockResolvedValue({ pl_title: "X", description: null });

    const result = await enrichMissingLocalizedTitles(db, { limit: 10, delayMs: 0 });
    expect(result.checked).toBe(0);
    expect(getMovieLocalized).not.toHaveBeenCalled();
  });

  it("stores the original title when TMDb has no Polish one, so it is not retried", async () => {
    const id = addMovie(db, "Obscure", 4);
    vi.mocked(getMovieLocalized).mockResolvedValue({ pl_title: null, description: null });

    await enrichMissingLocalizedTitles(db, { limit: 10, delayMs: 0 });
    const row = db.prepare("SELECT pl_title FROM movies WHERE id = ?").get(id) as { pl_title: string };
    expect(row.pl_title).toBe("Obscure");

    const again = await enrichMissingLocalizedTitles(db, { limit: 10, delayMs: 0 });
    expect(again.checked).toBe(0);
  });

  it("leaves a row untouched on a TMDb error so the next sync retries it", async () => {
    const id = addMovie(db, "Flaky", 5);
    vi.mocked(getMovieLocalized).mockRejectedValue(new Error("429"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await enrichMissingLocalizedTitles(db, { limit: 10, delayMs: 0 });
    expect(result).toEqual({ checked: 1, updated: 0, failed: 1 });
    const row = db.prepare("SELECT pl_title FROM movies WHERE id = ?").get(id) as { pl_title: string | null };
    expect(row.pl_title).toBeNull();
  });

  it("handles files on disk first and respects the limit", async () => {
    addMovie(db, "No file", 6);
    addMovie(db, "On disk", 7, { file_path: "/x/a.mp4" });
    vi.mocked(getMovieLocalized).mockResolvedValue({ pl_title: "PL", description: null });

    const result = await enrichMissingLocalizedTitles(db, { limit: 1, delayMs: 0 });
    expect(result.checked).toBe(1);
    expect(vi.mocked(getMovieLocalized).mock.calls[0][0]).toBe(7);
  });
});
