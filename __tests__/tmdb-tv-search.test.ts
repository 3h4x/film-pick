import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { clearTmdbCache, getTmdbTvDetails, searchTmdbForUi } from "@/lib/tmdb";
import { initDb, insertMovie, getExistingMovieInsertTargetId } from "@/lib/db";
import {
  buildTmdbMovieIndex,
  excludeShownTmdbResults,
  getTmdbSearchMovieState,
  upsertCanonicalTmdbMovie,
} from "@/lib/search";
import type { Movie } from "@/lib/types";

const originalFetch = global.fetch;

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

describe("TV series in TMDb search", () => {
  beforeEach(() => {
    clearTmdbCache();
    process.env.TMDB_API_KEY = "test-key";
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("searches films and series together; an exact series title comes first", async () => {
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/search/movie")) {
        return json({ results: [{ id: 11, title: "Sample Bay Story", release_date: "2019-01-01", genre_ids: [18], vote_average: 6, poster_path: null }] });
      }
      if (u.includes("/search/tv")) {
        return json({ results: [{ id: 900, name: "Sample Bay", first_air_date: "2026-04-01", genre_ids: [35, 10765], vote_average: 7.4, poster_path: "/p.jpg" }] });
      }
      throw new Error(`unexpected ${u}`);
    }) as unknown as typeof fetch;

    const results = await searchTmdbForUi("Sample Bay");

    expect(results.map((r) => [r.title, r.media_type ?? "movie"])).toEqual([
      ["Sample Bay", "tv"],
      ["Sample Bay Story", "movie"],
    ]);
    expect(results[0]).toMatchObject({ year: 2026, tmdb_id: 900, genre: "Comedy, Sci-Fi, Fantasy" });
  });

  it("still returns films when the TV search fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    global.fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("/search/tv")
        ? { ok: false, status: 500, json: async () => ({}), text: async () => "down" }
        : json({ results: [{ id: 11, title: "Sample Film", release_date: "2019-01-01", genre_ids: [], vote_average: 6, poster_path: null }] }),
    ) as unknown as typeof fetch;
    expect((await searchTmdbForUi("Sample Film")).map((r) => r.title)).toEqual(["Sample Film"]);
    vi.restoreAllMocks();
  });

  it("describes a series: creators, cast, episode runtime, language", async () => {
    global.fetch = vi.fn(async () =>
      json({
        created_by: [{ name: "Jane Example" }, { name: "John Placeholder" }],
        aggregate_credits: { cast: [{ name: "Alex Sample" }, { name: "Sam Testcase" }] },
        episode_run_time: [0, 48],
        original_language: "en",
      }),
    ) as unknown as typeof fetch;
    expect(await getTmdbTvDetails(900)).toEqual({
      director: "Jane Example, John Placeholder",
      writer: null,
      actors: "Alex Sample, Sam Testcase",
      tmdb_collection_checked: true,
      runtime: 48,
      original_language: "en",
    });
    expect(String(vi.mocked(global.fetch).mock.calls[0][0])).toContain("/tv/900?append_to_response=aggregate_credits");
  });
});

describe("a series and a film with the same TMDb number stay apart", () => {
  const TEST_DB = path.join(__dirname, "test-tv-kind.db");
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });
  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  const base = { year: 2020, genre: null, director: null, rating: null, poster_url: null, source: "tmdb", imdb_id: null, tmdb_id: 500 };

  it("inserting a series does not merge it into the film", () => {
    const filmId = insertMovie(db, { ...base, title: "Sample Film", type: "movie" });
    expect(getExistingMovieInsertTargetId(db, { ...base, title: "Sample Show", type: "tv" })).toBeNull();
    const showId = insertMovie(db, { ...base, title: "Sample Show", type: "tv" });
    expect(showId).not.toBe(filmId);
    expect(getExistingMovieInsertTargetId(db, { ...base, title: "Sample Show", type: "tv" })).toBe(showId);
  });

  it("same title and year but different kind is not the same entry", () => {
    insertMovie(db, { ...base, tmdb_id: 501, title: "Sample Title", type: "movie" });
    expect(getExistingMovieInsertTargetId(db, { ...base, tmdb_id: null, title: "Sample Title", type: "tv" })).toBeNull();
  });
});

describe("search state is kind-aware", () => {
  const film = { id: 1, title: "Sample Film", tmdb_id: 500, type: "movie", wishlist: 0 } as Movie;
  const index = buildTmdbMovieIndex([film]);

  it("a series result is not 'in library' because of a film with its number", () => {
    expect(getTmdbSearchMovieState(index, 500, "tv").existingMovie).toBeUndefined();
    expect(getTmdbSearchMovieState(index, 500, "movie").existingMovie).toBe(film);
    expect(getTmdbSearchMovieState(index, 500).existingMovie).toBe(film);
  });

  it("only hides TMDb results of the same kind as the library match", () => {
    const results = [{ tmdb_id: 500, media_type: "tv" as const }, { tmdb_id: 500 }];
    expect(excludeShownTmdbResults(results, [film])).toEqual([{ tmdb_id: 500, media_type: "tv" }]);
  });

  it("upserting a new series keeps the film", () => {
    const show = { id: 2, title: "Sample Show", tmdb_id: 500, type: "tv" } as Movie;
    const next = upsertCanonicalTmdbMovie([film], 500, show, show);
    expect(next.map((m) => m.id)).toEqual([2, 1]);
  });
});
