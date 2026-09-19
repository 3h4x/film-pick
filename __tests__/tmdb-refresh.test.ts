import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, getMovies } from "@/lib/db";

vi.mock("@/lib/tmdb", () => ({ getTmdbMovieSnapshot: vi.fn() }));

import { refreshStaleTmdbMetadata } from "@/lib/tmdb-refresh";
import { getTmdbMovieSnapshot } from "@/lib/tmdb";

const TEST_DB = path.join(__dirname, "test-tmdb-refresh.db");
const NOW = () => Math.floor(Date.now() / 1000);
const DAY = 24 * 60 * 60;

function snapshot(over: Record<string, unknown> = {}) {
  return {
    title: "The Odyssey",
    year: 2026,
    genre: "Adventure",
    rating: 7.1,
    poster_url: "https://image.tmdb.org/p.jpg",
    tmdb_id: 1,
    imdb_id: "tt1",
    pl_title: "Odyseja",
    description: "Opis",
    director: "Christopher Nolan",
    writer: "Christopher Nolan",
    actors: "Matt Damon, Tom Holland",
    tmdb_collection_id: null,
    tmdb_collection_name: null,
    ...over,
  };
}

function addMovie(db: Database.Database, title: string, tmdbId: number | null, refreshedAt: number | null = null) {
  return db
    .prepare(
      "INSERT INTO movies (title, year, tmdb_id, type, source, tmdb_refreshed_at) VALUES (?, 2026, ?, 'movie', 'local', ?)",
    )
    .run(title, tmdbId, refreshedAt).lastInsertRowid as number;
}

const opts = { limit: 100, maxAgeDays: 30, delayMs: 0 };

describe("refreshStaleTmdbMetadata (used by sync/import)", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getTmdbMovieSnapshot).mockReset();
    vi.mocked(getTmdbMovieSnapshot).mockResolvedValue(snapshot());
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("makes a synced film searchable by Polish title, director and cast", async () => {
    addMovie(db, "The Odyssey", 1);
    for (const q of ["odyseja", "nolan", "holland"]) {
      expect(getMovies(db, undefined, q)).toHaveLength(0);
    }

    const result = await refreshStaleTmdbMetadata(db, opts);

    expect(result).toEqual({ updated: 1, skipped: 0 });
    for (const q of ["odyseja", "nolan", "holland"]) {
      expect(getMovies(db, undefined, q)).toHaveLength(1);
    }
  });

  it("skips movies refreshed recently and refreshes stale or never-refreshed ones", async () => {
    addMovie(db, "Recent", 1, NOW() - 2 * DAY);
    addMovie(db, "Stale", 2, NOW() - 40 * DAY);
    addMovie(db, "Never", 3, null);

    await refreshStaleTmdbMetadata(db, opts);

    const asked = vi.mocked(getTmdbMovieSnapshot).mock.calls.map((c) => c[0]).sort();
    expect(asked).toEqual([2, 3]);
  });

  it("records when a movie was refreshed, so the next run skips it", async () => {
    const id = addMovie(db, "Once", 1);
    await refreshStaleTmdbMetadata(db, opts);
    const row = db.prepare("SELECT tmdb_refreshed_at AS t FROM movies WHERE id = ?").get(id) as { t: number };
    expect(Math.abs(row.t - NOW())).toBeLessThan(5);

    vi.mocked(getTmdbMovieSnapshot).mockClear();
    await refreshStaleTmdbMetadata(db, opts);
    expect(getTmdbMovieSnapshot).not.toHaveBeenCalled();
  });

  it("stores the collection from the snapshot", async () => {
    const id = addMovie(db, "Part 1", 1);
    vi.mocked(getTmdbMovieSnapshot).mockResolvedValue(
      snapshot({ tmdb_collection_id: 99, tmdb_collection_name: "Saga" }),
    );
    await refreshStaleTmdbMetadata(db, opts);
    const row = db
      .prepare("SELECT tmdb_collection_id AS id, tmdb_collection_name AS name, tmdb_collection_checked AS c FROM movies WHERE id = ?")
      .get(id) as { id: number; name: string; c: number };
    expect(row).toEqual({ id: 99, name: "Saga", c: 1 });
  });

  it("does not wipe an existing collection when the snapshot has none", async () => {
    const id = addMovie(db, "Part 1", 1);
    db.prepare("UPDATE movies SET tmdb_collection_id = 5, tmdb_collection_name = 'Old' WHERE id = ?").run(id);
    await refreshStaleTmdbMetadata(db, opts);
    const row = db.prepare("SELECT tmdb_collection_id AS id FROM movies WHERE id = ?").get(id) as { id: number };
    expect(row.id).toBe(5);
  });

  it("marks a movie TMDb does not know so it is not asked again", async () => {
    const id = addMovie(db, "Ghost", 424242);
    vi.mocked(getTmdbMovieSnapshot).mockResolvedValue(null);

    const first = await refreshStaleTmdbMetadata(db, opts);
    expect(first).toEqual({ updated: 0, skipped: 1 });
    const row = db.prepare("SELECT tmdb_refreshed_at AS t FROM movies WHERE id = ?").get(id) as { t: number | null };
    expect(row.t).not.toBeNull();

    vi.mocked(getTmdbMovieSnapshot).mockClear();
    await refreshStaleTmdbMetadata(db, opts);
    expect(getTmdbMovieSnapshot).not.toHaveBeenCalled();
  });

  it("does not mark a movie on a transient error, so the next run retries it", async () => {
    const id = addMovie(db, "Flaky", 1);
    vi.mocked(getTmdbMovieSnapshot).mockRejectedValue(new Error("network"));

    const result = await refreshStaleTmdbMetadata(db, opts);
    expect(result).toEqual({ updated: 0, skipped: 1 });
    const row = db.prepare("SELECT tmdb_refreshed_at AS t FROM movies WHERE id = ?").get(id) as { t: number | null };
    expect(row.t).toBeNull();
  });

  it("aborts on a TMDb API failure and keeps what was already refreshed", async () => {
    addMovie(db, "A", 1);
    addMovie(db, "B", 2);
    vi.mocked(getTmdbMovieSnapshot)
      .mockResolvedValueOnce(snapshot())
      .mockRejectedValue(new Error("tmdb_api_error:429"));

    await expect(refreshStaleTmdbMetadata(db, opts)).rejects.toThrow("tmdb_api_error");
    const done = db.prepare("SELECT COUNT(*) AS n FROM movies WHERE tmdb_refreshed_at IS NOT NULL").get() as { n: number };
    expect(done.n).toBe(1);
  });

  it("runs requests in parallel up to the concurrency and reports progress", async () => {
    for (let i = 1; i <= 8; i++) addMovie(db, `M${i}`, i);
    let inFlight = 0;
    let peak = 0;
    vi.mocked(getTmdbMovieSnapshot).mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return snapshot();
    });
    const progress: number[] = [];

    const result = await refreshStaleTmdbMetadata(db, {
      ...opts,
      concurrency: 4,
      onProgress: (current, total) => {
        expect(total).toBe(8);
        progress.push(current);
      },
    });

    expect(result.updated).toBe(8);
    expect(peak).toBe(4);
    expect(progress).toHaveLength(8);
    expect(Math.max(...progress)).toBe(8);
  });

  it("stays sequential by default", async () => {
    for (let i = 1; i <= 3; i++) addMovie(db, `M${i}`, i);
    let inFlight = 0;
    let peak = 0;
    vi.mocked(getTmdbMovieSnapshot).mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      return snapshot();
    });
    await refreshStaleTmdbMetadata(db, opts);
    expect(peak).toBe(1);
  });

  describe("fillOnly", () => {
    it("keeps what is already stored and only fills gaps; the rating is still refreshed", async () => {
      const id = db
        .prepare(
          "INSERT INTO movies (title, year, tmdb_id, type, source, genre, description, rating) VALUES ('My own title', 2026, 1, 'movie', 'tmdb', 'Comedy', 'My notes', 5.0)",
        )
        .run().lastInsertRowid as number;

      await refreshStaleTmdbMetadata(db, { ...opts, fillOnly: true });

      const row = db
        .prepare("SELECT title, genre, description, rating, director, pl_title, poster_url, tmdb_refreshed_at AS t FROM movies WHERE id = ?")
        .get(id) as Record<string, unknown>;
      expect(row.title).toBe("My own title");
      expect(row.genre).toBe("Comedy");
      expect(row.description).toBe("My notes");
      expect(row.rating).toBe(7.1); // refreshed
      expect(row.director).toBe("Christopher Nolan"); // filled
      expect(row.pl_title).toBe("Odyseja");
      expect(row.poster_url).toBe("https://image.tmdb.org/p.jpg");
      expect(row.t).not.toBeNull();
    });

    it("overwrites by default (the manual refresh behaviour)", async () => {
      const id = db
        .prepare("INSERT INTO movies (title, year, tmdb_id, type, source, genre) VALUES ('Old', 2026, 1, 'movie', 'tmdb', 'Comedy')")
        .run().lastInsertRowid as number;
      await refreshStaleTmdbMetadata(db, opts);
      const row = db.prepare("SELECT title, genre FROM movies WHERE id = ?").get(id) as { title: string; genre: string };
      expect(row).toEqual({ title: "The Odyssey", genre: "Adventure" });
    });

    it("treats an empty string as a gap", async () => {
      const id = db
        .prepare("INSERT INTO movies (title, year, tmdb_id, type, source, genre, pl_title) VALUES ('T', 2026, 1, 'movie', 'tmdb', '', '')")
        .run().lastInsertRowid as number;
      await refreshStaleTmdbMetadata(db, { ...opts, fillOnly: true });
      const row = db.prepare("SELECT genre, pl_title FROM movies WHERE id = ?").get(id) as { genre: string; pl_title: string };
      expect(row).toEqual({ genre: "Adventure", pl_title: "Odyseja" });
    });
  });

  describe("scope", () => {
    it("onlyIds restricts the run to those movies", async () => {
      const a = addMovie(db, "A", 1);
      addMovie(db, "B", 2);
      const c = addMovie(db, "C", 3);

      const result = await refreshStaleTmdbMetadata(db, { ...opts, onlyIds: [a, c] });

      expect(result.updated).toBe(2);
      expect(vi.mocked(getTmdbMovieSnapshot).mock.calls.map((x) => x[0]).sort()).toEqual([1, 3]);
    });

    it("never asks TMDb about CDA pseudo ids (32-bit URL hashes)", async () => {
      addMovie(db, "Real", 1);
      addMovie(db, "Pseudo", 1_747_246_420);

      await refreshStaleTmdbMetadata(db, opts);
      expect(vi.mocked(getTmdbMovieSnapshot).mock.calls.map((x) => x[0])).toEqual([1]);
    });
  });
});
