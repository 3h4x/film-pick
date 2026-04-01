import { describe, it, expect, vi, beforeEach } from "vitest";
import { genreEngine } from "@/lib/engines/genre";
import { buildContext, type EngineContext } from "@/lib/engines";
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
    const map: Record<string, number> = { "Sci-Fi": 878, "Action": 28, "Drama": 18 };
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
      makeMovie({ id: 1, title: "Inception", genre: "Sci-Fi, Action", user_rating: 9 } as any),
    ];
    const ctx = buildContext(library, new Set());

    mockDiscoverByGenre.mockResolvedValueOnce([
      { title: "Arrival", year: 2016, genre: "Sci-Fi", rating: 7.9, poster_url: null, tmdb_id: 329865, imdb_id: null },
    ]);

    const result = await genreEngine(ctx);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].reason).toContain("Because you love");
    expect(result[0].type).toBe("genre");
  });

  it("filters out dismissed recommendations", async () => {
    const library = [
      makeMovie({ id: 1, title: "Inception", genre: "Sci-Fi", user_rating: 9 } as any),
    ];
    const dismissed = new Set([329865]);
    const ctx = buildContext(library, dismissed);

    mockDiscoverByGenre.mockResolvedValueOnce([
      { title: "Arrival", year: 2016, genre: "Sci-Fi", rating: 7.9, poster_url: null, tmdb_id: 329865, imdb_id: null },
      { title: "Tenet", year: 2020, genre: "Sci-Fi", rating: 7.3, poster_url: null, tmdb_id: 577922, imdb_id: null },
    ]);

    const result = await genreEngine(ctx);
    const allTitles = result.flatMap((g: any) => g.recommendations.map((r: any) => r.title));
    expect(allTitles).not.toContain("Arrival");
  });

  it("deduplicates library movies", async () => {
    const library = [
      makeMovie({ id: 1, title: "Inception", tmdb_id: 27205, genre: "Sci-Fi", user_rating: 9 } as any),
    ];
    const ctx = buildContext(library, new Set());

    mockDiscoverByGenre.mockResolvedValueOnce([
      { title: "Inception", year: 2010, genre: "Sci-Fi", rating: 8.4, poster_url: null, tmdb_id: 27205, imdb_id: null },
      { title: "Tenet", year: 2020, genre: "Sci-Fi", rating: 7.3, poster_url: null, tmdb_id: 577922, imdb_id: null },
    ]);

    const result = await genreEngine(ctx);
    const allTmdbIds = result.flatMap((g: any) => g.recommendations.map((r: any) => r.tmdb_id));
    expect(allTmdbIds).not.toContain(27205);
  });
});
