import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildContext } from "@/lib/engines";
import type { Movie } from "@/lib/db";
import type { TmdbSearchResult } from "@/lib/tmdb";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockDiscoverByGenre, mockGenreNameToId } = vi.hoisted(() => ({
  mockDiscoverByGenre: vi.fn(),
  mockGenreNameToId: vi.fn(),
}));

vi.mock("@/lib/tmdb", () => ({
  discoverByGenre: mockDiscoverByGenre,
  genreNameToId: mockGenreNameToId,
}));

import { genreEngine } from "@/lib/engines/genre";
import { randomEngine } from "@/lib/engines/random";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMovie(overrides: Partial<Movie> & { id: number; title: string }): Movie {
  return {
    year: 2010,
    genre: "Drama",
    director: null,
    rating: 7.5,
    poster_url: null,
    source: "tmdb",
    imdb_id: null,
    tmdb_id: overrides.id * 100,
    type: "movie",
    file_path: null,
    created_at: "2026-01-01",
    ...overrides,
  } as Movie;
}

function makeResult(
  overrides: Partial<TmdbSearchResult> & { tmdb_id: number; title: string },
): TmdbSearchResult {
  return {
    year: 2020,
    genre: "Drama",
    rating: 7.0,
    poster_url: null,
    imdb_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockDiscoverByGenre.mockResolvedValue([]);
  mockGenreNameToId.mockReturnValue(null);
});

// ---------------------------------------------------------------------------
// genreEngine
// ---------------------------------------------------------------------------

describe("genreEngine", () => {
  it("returns empty when library is empty", async () => {
    const ctx = buildContext([], new Set());
    expect(await genreEngine(ctx)).toEqual([]);
  });

  it("returns empty when no movies have genres", async () => {
    const library = [makeMovie({ id: 1, title: "Film", genre: null as unknown as string })];
    const ctx = buildContext(library, new Set());
    expect(await genreEngine(ctx)).toEqual([]);
  });

  it("returns empty when genreNameToId resolves nothing", async () => {
    const library = [makeMovie({ id: 1, title: "Film", genre: "Drama", user_rating: 8 })];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockReturnValue(null);
    expect(await genreEngine(ctx)).toEqual([]);
  });

  it("returns empty when discoverByGenre yields no results", async () => {
    const library = [makeMovie({ id: 1, title: "Film", genre: "Drama", user_rating: 8 })];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockReturnValue(18);
    mockDiscoverByGenre.mockResolvedValue([]);
    expect(await genreEngine(ctx)).toEqual([]);
  });

  it("returns a group for a discovered genre", async () => {
    const library = [makeMovie({ id: 1, title: "Drama Film", genre: "Drama", user_rating: 8 })];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockReturnValue(18);
    mockDiscoverByGenre.mockResolvedValue([
      makeResult({ tmdb_id: 500, title: "New Drama" }),
    ]);

    const result = await genreEngine(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("genre");
    expect(result[0].reason).toContain("Drama");
    expect(result[0].recommendations[0].title).toBe("New Drama");
  });

  it("excludes movies already in library from recommendations", async () => {
    const library = [makeMovie({ id: 1, title: "Drama Film", genre: "Drama", tmdb_id: 100, user_rating: 8 })];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockReturnValue(18);
    mockDiscoverByGenre.mockResolvedValue([
      makeResult({ tmdb_id: 100, title: "Drama Film" }), // in library
      makeResult({ tmdb_id: 200, title: "Fresh Drama" }),
    ]);

    const result = await genreEngine(ctx);
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).not.toContain("Drama Film");
    expect(titles).toContain("Fresh Drama");
  });

  it("excludes dismissed movies", async () => {
    const library = [makeMovie({ id: 1, title: "Drama Film", genre: "Drama", user_rating: 8 })];
    const ctx = buildContext(library, new Set([999]));
    mockGenreNameToId.mockReturnValue(18);
    mockDiscoverByGenre.mockResolvedValue([
      makeResult({ tmdb_id: 999, title: "Dismissed" }),
      makeResult({ tmdb_id: 888, title: "Visible" }),
    ]);

    const result = await genreEngine(ctx);
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).not.toContain("Dismissed");
    expect(titles).toContain("Visible");
  });

  it("skips genres with weight < 5 (disliked movies)", async () => {
    const library = [
      makeMovie({ id: 1, title: "Bad Drama", genre: "Drama", user_rating: 3 }),
      makeMovie({ id: 2, title: "Good Sci-Fi", genre: "Sci-Fi", user_rating: 9 }),
    ];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockImplementation((g: string) => (g === "Sci-Fi" ? 878 : 18));
    mockDiscoverByGenre.mockResolvedValue([makeResult({ tmdb_id: 500, title: "Space Film" })]);

    await genreEngine(ctx);
    // Should only be called for Sci-Fi (drama has user_rating < 5)
    expect(mockDiscoverByGenre).toHaveBeenCalledWith(878);
    expect(mockDiscoverByGenre).not.toHaveBeenCalledWith(18);
  });

  it("treats user_rating=0 as unrated — still generates results via fallback for fresh libraries", async () => {
    // user_rating=0 means "not yet rated". Primary scoring requires >= 7, fallback for >= 5,
    // and a final fallback includes unrated movies with neutral weight so fresh libraries work.
    const library = [
      makeMovie({ id: 1, title: "Unrated Drama", genre: "Drama", user_rating: 0 }),
    ];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockReturnValue(18);
    mockDiscoverByGenre.mockResolvedValue([makeResult({ tmdb_id: 500, title: "Found Drama" })]);

    const result = await genreEngine(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toContain("Drama");
    expect(mockDiscoverByGenre).toHaveBeenCalledWith(18);
  });

  it("unrated (user_rating=0) and null-rated movies both reach the fallback and produce results", async () => {
    const library = [
      makeMovie({ id: 1, title: "Null Rated", genre: "Drama", user_rating: undefined }),
      makeMovie({ id: 2, title: "Zero Rated", genre: "Drama", user_rating: 0 }),
    ];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockReturnValue(18);
    mockDiscoverByGenre.mockResolvedValue([makeResult({ tmdb_id: 500, title: "Drama Film" })]);

    const result = await genreEngine(ctx);
    expect(result).toHaveLength(1);
    // Both go through fallback 2 with neutral weight; Drama still wins
    expect(mockDiscoverByGenre).toHaveBeenCalledTimes(1);
    expect(mockDiscoverByGenre).toHaveBeenCalledWith(18);
  });

  it("skips genres marked as 'Unknown'", async () => {
    const library = [makeMovie({ id: 1, title: "Film", genre: "Unknown", user_rating: 8 })];
    const ctx = buildContext(library, new Set());
    expect(await genreEngine(ctx)).toEqual([]);
    expect(mockDiscoverByGenre).not.toHaveBeenCalled();
  });

  it("weights genres by user_rating and picks top genres", async () => {
    const library = [
      makeMovie({ id: 1, title: "Sci-Fi A", genre: "Sci-Fi", user_rating: 10 }),
      makeMovie({ id: 2, title: "Sci-Fi B", genre: "Sci-Fi", user_rating: 9 }),
      makeMovie({ id: 3, title: "Drama A", genre: "Drama", user_rating: 6 }),
    ];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockImplementation((g: string) => (g === "Sci-Fi" ? 878 : 18));
    mockDiscoverByGenre.mockResolvedValue([makeResult({ tmdb_id: 501, title: "Found Film" })]);

    const result = await genreEngine(ctx);
    // Sci-Fi should appear (weight=19) before Drama (weight=6)
    expect(result[0].reason).toContain("Sci-Fi");
  });

  it("limits recommendations to 15 per group", async () => {
    const library = [makeMovie({ id: 1, title: "Drama Film", genre: "Drama", user_rating: 8 })];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockReturnValue(18);
    mockDiscoverByGenre.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => makeResult({ tmdb_id: i + 1, title: `Film ${i}` })),
    );

    const result = await genreEngine(ctx);
    expect(result[0].recommendations).toHaveLength(15);
  });

  it("handles multi-genre movies (comma-separated)", async () => {
    const library = [
      makeMovie({ id: 1, title: "Film", genre: "Action, Comedy", user_rating: 8 }),
    ];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockImplementation((g: string) => (g === "Action" ? 28 : g === "Comedy" ? 35 : null));
    // Return different results for each genre (tmdb_ids not in library)
    mockDiscoverByGenre
      .mockResolvedValueOnce([makeResult({ tmdb_id: 501, title: "Action Film" })])
      .mockResolvedValueOnce([makeResult({ tmdb_id: 502, title: "Comedy Film" })]);

    const result = await genreEngine(ctx);
    // Both Action and Comedy should produce genre groups
    expect(result).toHaveLength(2);
    const reasons = result.map((r) => r.reason);
    expect(reasons.some((r) => r.includes("Action"))).toBe(true);
    expect(reasons.some((r) => r.includes("Comedy"))).toBe(true);
  });

  it("skips genre group when all discovered results are filtered out", async () => {
    const library = [makeMovie({ id: 1, title: "Drama Film", genre: "Drama", tmdb_id: 500, user_rating: 8 })];
    const ctx = buildContext(library, new Set());
    mockGenreNameToId.mockReturnValue(18);
    // Only result is already in library
    mockDiscoverByGenre.mockResolvedValue([makeResult({ tmdb_id: 500, title: "Drama Film" })]);

    expect(await genreEngine(ctx)).toEqual([]);
  });

  it("only processes the top N genres (default 6) even when library has more", async () => {
    // Create 10 distinct genres each with one high-rated movie
    const genres = Array.from(
      { length: 10 },
      (_, i) => `Genre${String.fromCharCode(65 + i)}`,
    );
    const library = genres.map((g, i) =>
      makeMovie({ id: i + 1, title: `Film ${g}`, genre: g, user_rating: 8 }),
    );
    const ctx = buildContext(library, new Set());

    // All genres resolve to a valid ID and return one unique result each
    mockGenreNameToId.mockImplementation((g: string) => genres.indexOf(g) + 1);
    mockDiscoverByGenre.mockImplementation((id: number) =>
      Promise.resolve([makeResult({ tmdb_id: id * 1000, title: `Discovered ${id}` })]),
    );

    const result = await genreEngine(ctx);
    // Default top_genre_count is 6
    expect(result.length).toBeLessThanOrEqual(6);
    expect(mockDiscoverByGenre).toHaveBeenCalledTimes(6);
  });
});

// ---------------------------------------------------------------------------
// randomEngine
// ---------------------------------------------------------------------------

describe("randomEngine", () => {
  it("returns empty when library is empty", async () => {
    const ctx = buildContext([], new Set());
    expect(await randomEngine(ctx)).toEqual([]);
  });

  it("returns empty when all library movies have no tmdb_id", async () => {
    const library = [makeMovie({ id: 1, title: "Film", tmdb_id: null as unknown as number })];
    const ctx = buildContext(library, new Set());
    expect(await randomEngine(ctx)).toEqual([]);
  });

  it("returns empty when all movies are dismissed", async () => {
    const library = [makeMovie({ id: 1, title: "Film", tmdb_id: 100 })];
    const ctx = buildContext(library, new Set([100]));
    expect(await randomEngine(ctx)).toEqual([]);
  });

  it("returns empty when all movies have user_rating (already rated)", async () => {
    const library = [makeMovie({ id: 1, title: "Film", tmdb_id: 100, user_rating: 7 })];
    const ctx = buildContext(library, new Set());
    expect(await randomEngine(ctx)).toEqual([]);
  });

  it("returns a group with random picks from unrated library", async () => {
    const library = [
      makeMovie({ id: 1, title: "Film A", tmdb_id: 100 }),
      makeMovie({ id: 2, title: "Film B", tmdb_id: 200 }),
    ];
    const ctx = buildContext(library, new Set());

    const result = await randomEngine(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("random");
    expect(result[0].reason).toContain("Random");
    expect(result[0].recommendations).toHaveLength(2);
  });

  it("limits picks to 15 even with large library", async () => {
    const library = Array.from({ length: 50 }, (_, i) =>
      makeMovie({ id: i + 1, title: `Film ${i}`, tmdb_id: (i + 1) * 10 }),
    );
    const ctx = buildContext(library, new Set());

    const result = await randomEngine(ctx);
    expect(result[0].recommendations).toHaveLength(15);
  });

  it("maps movie fields correctly into recommendations", async () => {
    const library = [
      makeMovie({
        id: 1,
        title: "Test Movie",
        tmdb_id: 42,
        year: 2005,
        genre: "Thriller",
        rating: 8.2,
        poster_url: "http://example.com/poster.jpg",
        imdb_id: "tt0000001",
        pl_title: "Testowy Film",
      }),
    ];
    const ctx = buildContext(library, new Set());

    const result = await randomEngine(ctx);
    const pick = result[0].recommendations[0];
    expect(pick.tmdb_id).toBe(42);
    expect(pick.title).toBe("Test Movie");
    expect(pick.year).toBe(2005);
    expect(pick.genre).toBe("Thriller");
    expect(pick.rating).toBe(8.2);
    expect(pick.poster_url).toBe("http://example.com/poster.jpg");
    expect(pick.imdb_id).toBe("tt0000001");
    expect(pick.pl_title).toBe("Testowy Film");
  });

  it("excludes dismissed movies from random picks", async () => {
    const library = [
      makeMovie({ id: 1, title: "Dismissed", tmdb_id: 100 }),
      makeMovie({ id: 2, title: "Visible", tmdb_id: 200 }),
    ];
    const ctx = buildContext(library, new Set([100]));

    const result = await randomEngine(ctx);
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).not.toContain("Dismissed");
    expect(titles).toContain("Visible");
  });

  it("excludes already-rated movies from random picks", async () => {
    const library = [
      makeMovie({ id: 1, title: "Already Rated", tmdb_id: 100, user_rating: 9 }),
      makeMovie({ id: 2, title: "Unrated", tmdb_id: 200 }),
    ];
    const ctx = buildContext(library, new Set());

    const result = await randomEngine(ctx);
    const titles = result[0].recommendations.map((r) => r.title);
    expect(titles).not.toContain("Already Rated");
    expect(titles).toContain("Unrated");
  });

  it("produces a shuffled output (Fisher-Yates)", async () => {
    // Run the engine multiple times and verify it doesn't always return the same order.
    // With 20 items the probability that all runs produce the same order is negligible.
    const library = Array.from({ length: 20 }, (_, i) =>
      makeMovie({ id: i + 1, title: `Film ${i}`, tmdb_id: (i + 1) * 10 }),
    );
    const ctx = buildContext(library, new Set());

    const orders = await Promise.all(
      Array.from({ length: 5 }, () => randomEngine(ctx).then((r) => r[0].recommendations.map((m) => m.tmdb_id))),
    );
    const allSame = orders.every((o) => JSON.stringify(o) === JSON.stringify(orders[0]));
    expect(allSame).toBe(false);
  });
});
