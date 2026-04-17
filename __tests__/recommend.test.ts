import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomEngine } from "@/lib/engines/random";
import { genreEngine } from "@/lib/engines/genre";
import {
  buildContext,
  filterResults,
  enrichWithCda,
  type EngineContext,
} from "@/lib/engines";
import type { TmdbSearchResult } from "@/lib/tmdb";
import type { Movie } from "@/lib/db";

vi.mock("@/lib/tmdb", () => ({
  getTmdbRecommendations: vi.fn().mockResolvedValue([]),
  discoverByGenre: vi.fn().mockResolvedValue([]),
  discoverByPerson: vi.fn().mockResolvedValue([]),
  discoverHiddenGems: vi.fn().mockResolvedValue([]),
  discoverStarStudded: vi.fn().mockResolvedValue([]),
  discoverRandom: vi.fn().mockResolvedValue([]),
  getMovieCredits: vi.fn().mockResolvedValue({ directors: [], cast: [] }),
  genreNameToId: vi.fn((name: string) => {
    const map: Record<string, number> = {
      "Sci-Fi": 878,
      Action: 28,
      Drama: 18,
    };
    return map[name] ?? null;
  }),
}));

import { discoverByGenre } from "@/lib/tmdb";
const mockDiscoverByGenre = vi.mocked(discoverByGenre);

function makeMovie(overrides: Partial<Movie> & { title: string }): Movie {
  return {
    id: 1,
    year: 2010,
    genre: "Sci-Fi",
    director: null,
    rating: 8.0,
    poster_url: null,
    source: "tmdb",
    imdb_id: null,
    tmdb_id: 27205,
    type: "movie",
    file_path: null,
    created_at: "2026-01-01",
    ...overrides,
  } as Movie;
}

describe("genre engine", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDiscoverByGenre.mockResolvedValue([]);
  });

  it("returns empty when library is empty", async () => {
    const ctx = buildContext([], new Set());
    const result = await genreEngine(ctx);
    expect(result).toEqual([]);
  });

  it("generates genre-based recommendations", async () => {
    const library = [
      makeMovie({
        id: 1,
        title: "Inception",
        genre: "Sci-Fi, Action",
        user_rating: 9,
      }),
    ];
    const ctx = buildContext(library, new Set());

    mockDiscoverByGenre.mockResolvedValueOnce([
      {
        title: "Arrival",
        year: 2016,
        genre: "Sci-Fi",
        rating: 7.9,
        poster_url: null,
        tmdb_id: 329865,
        imdb_id: null,
      },
    ]);

    const result = await genreEngine(ctx);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].reason).toContain("Because you love");
    expect(result[0].type).toBe("genre");
  });

  it("filters out dismissed recommendations", async () => {
    const library = [
      makeMovie({
        id: 1,
        title: "Inception",
        genre: "Sci-Fi",
        user_rating: 9,
      }),
    ];
    const dismissed = new Set([329865]);
    const ctx = buildContext(library, dismissed);

    mockDiscoverByGenre.mockResolvedValueOnce([
      {
        title: "Arrival",
        year: 2016,
        genre: "Sci-Fi",
        rating: 7.9,
        poster_url: null,
        tmdb_id: 329865,
        imdb_id: null,
      },
      {
        title: "Tenet",
        year: 2020,
        genre: "Sci-Fi",
        rating: 7.3,
        poster_url: null,
        tmdb_id: 577922,
        imdb_id: null,
      },
    ]);

    const result = await genreEngine(ctx);
    const allTitles = result.flatMap((g: any) =>
      g.recommendations.map((r: any) => r.title),
    );
    expect(allTitles).not.toContain("Arrival");
  });

  it("deduplicates library movies", async () => {
    const library = [
      makeMovie({
        id: 1,
        title: "Inception",
        tmdb_id: 27205,
        genre: "Sci-Fi",
        user_rating: 9,
      }),
    ];
    const ctx = buildContext(library, new Set());

    mockDiscoverByGenre.mockResolvedValueOnce([
      {
        title: "Inception",
        year: 2010,
        genre: "Sci-Fi",
        rating: 8.4,
        poster_url: null,
        tmdb_id: 27205,
        imdb_id: null,
      },
      {
        title: "Tenet",
        year: 2020,
        genre: "Sci-Fi",
        rating: 7.3,
        poster_url: null,
        tmdb_id: 577922,
        imdb_id: null,
      },
    ]);

    const result = await genreEngine(ctx);
    const allTmdbIds = result.flatMap((g: any) =>
      g.recommendations.map((r: any) => r.tmdb_id),
    );
    expect(allTmdbIds).not.toContain(27205);
  });
});

function makeResult(overrides: Partial<TmdbSearchResult> & { tmdb_id: number; title: string }): TmdbSearchResult {
  return {
    year: 2020,
    genre: "Drama",
    rating: 7.5,
    poster_url: null,
    imdb_id: null,
    ...overrides,
  };
}

describe("filterResults", () => {
  const emptyCtx = buildContext([], new Set());

  it("returns all results when context is empty", () => {
    const results = [
      makeResult({ tmdb_id: 1, title: "Movie A" }),
      makeResult({ tmdb_id: 2, title: "Movie B" }),
    ];
    expect(filterResults(results, emptyCtx)).toHaveLength(2);
  });

  it("filters out movies already in the library by tmdb_id", () => {
    const library = [makeMovie({ id: 1, title: "Inception", tmdb_id: 27205 })];
    const ctx = buildContext(library, new Set());
    const results = [
      makeResult({ tmdb_id: 27205, title: "Inception" }),
      makeResult({ tmdb_id: 329865, title: "Arrival" }),
    ];
    const filtered = filterResults(results, ctx);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Arrival");
  });

  it("filters out movies already in the library by title", () => {
    const library = [makeMovie({ id: 1, title: "Inception", tmdb_id: null })];
    const ctx = buildContext(library, new Set());
    const results = [
      makeResult({ tmdb_id: 99999, title: "Inception" }),
      makeResult({ tmdb_id: 329865, title: "Arrival" }),
    ];
    const filtered = filterResults(results, ctx);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Arrival");
  });

  it("filters out dismissed movies", () => {
    const dismissed = new Set([27205]);
    const ctx = buildContext([], dismissed);
    const results = [
      makeResult({ tmdb_id: 27205, title: "Inception" }),
      makeResult({ tmdb_id: 329865, title: "Arrival" }),
    ];
    const filtered = filterResults(results, ctx);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].tmdb_id).toBe(329865);
  });

  it("deduplicates using the seen set", () => {
    const seen = new Set([27205]);
    const results = [
      makeResult({ tmdb_id: 27205, title: "Inception" }),
      makeResult({ tmdb_id: 329865, title: "Arrival" }),
    ];
    const filtered = filterResults(results, emptyCtx, seen);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Arrival");
  });

  it("adds seen ids as results are returned", () => {
    const seen = new Set<number>();
    const results = [
      makeResult({ tmdb_id: 1, title: "A" }),
      makeResult({ tmdb_id: 1, title: "A duplicate" }),
      makeResult({ tmdb_id: 2, title: "B" }),
    ];
    const filtered = filterResults(results, emptyCtx, seen);
    expect(filtered).toHaveLength(2);
    expect(seen.has(1)).toBe(true);
    expect(seen.has(2)).toBe(true);
  });

  it("filters by min_year config", () => {
    const ctx = buildContext([], new Set(), {
      excluded_genres: [],
      min_year: 2000,
      min_rating: null,
      max_per_group: 10,
    });
    const results = [
      makeResult({ tmdb_id: 1, title: "Old Film", year: 1985 }),
      makeResult({ tmdb_id: 2, title: "New Film", year: 2010 }),
    ];
    const filtered = filterResults(results, ctx);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("New Film");
  });

  it("does not filter movies with null year when min_year is set", () => {
    const ctx = buildContext([], new Set(), {
      excluded_genres: [],
      min_year: 2000,
      min_rating: null,
      max_per_group: 10,
    });
    const results = [makeResult({ tmdb_id: 1, title: "Unknown Year", year: null })];
    expect(filterResults(results, ctx)).toHaveLength(1);
  });

  it("filters by min_rating config", () => {
    const ctx = buildContext([], new Set(), {
      excluded_genres: [],
      min_year: null,
      min_rating: 7.0,
      max_per_group: 10,
    });
    const results = [
      makeResult({ tmdb_id: 1, title: "Low Rated", rating: 5.0 }),
      makeResult({ tmdb_id: 2, title: "High Rated", rating: 8.5 }),
    ];
    const filtered = filterResults(results, ctx);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("High Rated");
  });

  it("filters by excluded_genres config", () => {
    const ctx = buildContext([], new Set(), {
      excluded_genres: ["Horror"],
      min_year: null,
      min_rating: null,
      max_per_group: 10,
    });
    const results = [
      makeResult({ tmdb_id: 1, title: "Scary Movie", genre: "Horror, Thriller" }),
      makeResult({ tmdb_id: 2, title: "Safe Film", genre: "Drama" }),
    ];
    const filtered = filterResults(results, ctx);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Safe Film");
  });

  it("returns all results when excluded_genres is empty", () => {
    const ctx = buildContext([], new Set(), {
      excluded_genres: [],
      min_year: null,
      min_rating: null,
      max_per_group: 10,
    });
    const results = [
      makeResult({ tmdb_id: 1, title: "Horror Film", genre: "Horror" }),
      makeResult({ tmdb_id: 2, title: "Drama Film", genre: "Drama" }),
    ];
    expect(filterResults(results, ctx)).toHaveLength(2);
  });
});

describe("randomEngine", () => {
  it("returns empty when library is empty", async () => {
    const ctx = buildContext([], new Set());
    expect(await randomEngine(ctx)).toEqual([]);
  });

  it("excludes movies with a user_rating", async () => {
    const library = [
      makeMovie({ id: 1, title: "Watched", tmdb_id: 1, user_rating: 8 }),
      makeMovie({ id: 2, title: "Unwatched", tmdb_id: 2, user_rating: undefined }),
    ];
    const ctx = buildContext(library, new Set());
    const result = await randomEngine(ctx);
    const titles = result.flatMap((g) => g.recommendations.map((r) => r.title));
    expect(titles).not.toContain("Watched");
    expect(titles).toContain("Unwatched");
  });

  it("excludes dismissed movies", async () => {
    const library = [
      makeMovie({ id: 1, title: "Dismissed", tmdb_id: 10 }),
      makeMovie({ id: 2, title: "Available", tmdb_id: 20 }),
    ];
    const ctx = buildContext(library, new Set([10]));
    const result = await randomEngine(ctx);
    const titles = result.flatMap((g) => g.recommendations.map((r) => r.title));
    expect(titles).not.toContain("Dismissed");
    expect(titles).toContain("Available");
  });

  it("returns empty when all candidates are watched or dismissed", async () => {
    const library = [
      makeMovie({ id: 1, title: "Watched", tmdb_id: 1, user_rating: 7 }),
      makeMovie({ id: 2, title: "Dismissed", tmdb_id: 2 }),
    ];
    const ctx = buildContext(library, new Set([2]));
    expect(await randomEngine(ctx)).toEqual([]);
  });
});

describe("enrichWithCda", () => {
  it("leaves results unchanged when no cda matches", () => {
    const results = [makeResult({ tmdb_id: 1, title: "Movie A" })];
    const lookup = { byTmdbId: new Map<number, string>(), byTitle: new Map<string, string>() };
    const enriched = enrichWithCda(results, lookup);
    expect(enriched[0].cda_url).toBeUndefined();
  });

  it("adds cda_url matched by tmdb_id", () => {
    const results = [makeResult({ tmdb_id: 329865, title: "Arrival" })];
    const lookup = {
      byTmdbId: new Map([[329865, "https://www.cda.pl/video/arrival"]]),
      byTitle: new Map<string, string>(),
    };
    const enriched = enrichWithCda(results, lookup);
    expect(enriched[0].cda_url).toBe("https://www.cda.pl/video/arrival");
  });

  it("adds cda_url matched by title (case-insensitive key)", () => {
    const results = [makeResult({ tmdb_id: 999, title: "Interstellar" })];
    const lookup = {
      byTmdbId: new Map<number, string>(),
      byTitle: new Map([["interstellar", "https://www.cda.pl/video/interstellar"]]),
    };
    const enriched = enrichWithCda(results, lookup);
    expect(enriched[0].cda_url).toBe("https://www.cda.pl/video/interstellar");
  });

  it("prefers tmdb_id match over title match", () => {
    const results = [makeResult({ tmdb_id: 329865, title: "Arrival" })];
    const lookup = {
      byTmdbId: new Map([[329865, "https://cda.pl/by-id"]]),
      byTitle: new Map([["arrival", "https://cda.pl/by-title"]]),
    };
    const enriched = enrichWithCda(results, lookup);
    expect(enriched[0].cda_url).toBe("https://cda.pl/by-id");
  });

  it("does not mutate original results array", () => {
    const results = [makeResult({ tmdb_id: 1, title: "Film" })];
    const lookup = {
      byTmdbId: new Map([[1, "https://cda.pl/film"]]),
      byTitle: new Map<string, string>(),
    };
    enrichWithCda(results, lookup);
    expect(results[0].cda_url).toBeUndefined();
  });
});
