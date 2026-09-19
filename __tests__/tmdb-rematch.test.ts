import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb } from "@/lib/db";

vi.mock("@/lib/tmdb", () => ({ searchTmdb: vi.fn() }));

import { rematchLocalMovies } from "@/lib/tmdb-rematch";
import { searchTmdb } from "@/lib/tmdb";

const TEST_DB = path.join(__dirname, "test-tmdb-rematch.db");
const opts = { maxAgeDays: 30, delayMs: 0 };

function hit(title: string, tmdbId: number, year = 2026) {
  return { title, year, genre: "Drama", rating: 7, poster_url: null, tmdb_id: tmdbId, imdb_id: null };
}

describe("rematchLocalMovies", () => {
  let db: Database.Database;

  function addLocal(title: string, year: number | null, extra: { source?: string; tmdbId?: number; matchedAt?: number; createdAt?: string; type?: string } = {}) {
    return db
      .prepare(
        "INSERT INTO movies (title, year, source, tmdb_id, tmdb_matched_at, type, created_at, file_path) VALUES (?, ?, ?, ?, ?, ?, ?, '/x/a.mkv')",
      )
      .run(
        title,
        year,
        extra.source ?? "local",
        extra.tmdbId ?? null,
        extra.matchedAt ?? null,
        extra.type ?? "movie",
        extra.createdAt ?? "2020-01-01 00:00:00",
      ).lastInsertRowid as number;
  }
  const row = (id: number) =>
    db.prepare("SELECT title, tmdb_id, source, tmdb_matched_at AS tried FROM movies WHERE id = ?").get(id) as {
      title: string;
      tmdb_id: number | null;
      source: string;
      tried: number | null;
    };

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(searchTmdb).mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("gives a local film its TMDb id, canonical title and source on a strong match", async () => {
    const id = addLocal("the odyssey", 2026);
    vi.mocked(searchTmdb).mockResolvedValue([hit("The Odyssey", 1234)]);

    const result = await rematchLocalMovies(db, opts);

    expect(result).toEqual({ matched: 1, unmatched: 0, failed: 0 });
    expect(row(id)).toMatchObject({ title: "The Odyssey", tmdb_id: 1234, source: "tmdb" });
    expect(row(id).tried).not.toBeNull();
  });

  it("leaves an unrelated result alone but records the attempt", async () => {
    const id = addLocal("my holiday clip", null);
    vi.mocked(searchTmdb).mockResolvedValue([hit("Something Else Entirely", 9)]);

    const result = await rematchLocalMovies(db, opts);
    expect(result).toEqual({ matched: 0, unmatched: 1, failed: 0 });
    expect(row(id)).toMatchObject({ tmdb_id: null, source: "local" });
    expect(row(id).tried).not.toBeNull();
  });

  it("does not steal a TMDb id another row already has", async () => {
    addLocal("Dune", 2021, { source: "tmdb", tmdbId: 438631 });
    const dupe = addLocal("Dune", 2021);
    vi.mocked(searchTmdb).mockResolvedValue([hit("Dune", 438631, 2021)]);

    const result = await rematchLocalMovies(db, opts);
    expect(result.matched).toBe(0);
    expect(row(dupe).tmdb_id).toBeNull();
  });

  it("does not ask again within the window, but does once it is stale", async () => {
    const now = Math.floor(Date.now() / 1000);
    addLocal("Recent try", 2001, { matchedAt: now - 2 * 86400 });
    addLocal("Stale try", 2002, { matchedAt: now - 40 * 86400 });
    vi.mocked(searchTmdb).mockResolvedValue([]);

    await rematchLocalMovies(db, opts);
    expect(vi.mocked(searchTmdb).mock.calls.map((c) => c[0])).toEqual(["Stale try"]);
  });

  it("skips rows added within the last day, rows with a TMDb id and non-local rows", async () => {
    addLocal("Fresh", 2001, { createdAt: new Date().toISOString().slice(0, 19).replace("T", " ") });
    addLocal("Has id", 2002, { tmdbId: 5 });
    addLocal("From filmweb", 2003, { source: "filmweb" });
    addLocal("A series", 2004, { type: "tv" });
    vi.mocked(searchTmdb).mockResolvedValue([]);

    const result = await rematchLocalMovies(db, opts);
    expect(result).toEqual({ matched: 0, unmatched: 0, failed: 0 });
    expect(searchTmdb).not.toHaveBeenCalled();
  });

  it("does not record a failed search, so the next run retries it", async () => {
    const id = addLocal("Flaky", 2001);
    vi.mocked(searchTmdb).mockRejectedValue(new Error("network"));

    const result = await rematchLocalMovies(db, opts);
    expect(result).toEqual({ matched: 0, unmatched: 0, failed: 1 });
    expect(row(id).tried).toBeNull();
  });

  it("reports progress and runs searches in parallel up to the concurrency", async () => {
    for (let i = 0; i < 6; i++) addLocal(`Film ${i}`, 2000 + i);
    let inFlight = 0;
    let peak = 0;
    vi.mocked(searchTmdb).mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return [];
    });
    const progress: number[] = [];

    await rematchLocalMovies(db, { ...opts, concurrency: 3, onProgress: (c) => progress.push(c) });
    expect(peak).toBe(3);
    expect(progress).toHaveLength(6);
  });
});
