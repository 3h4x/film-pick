import { describe, it, expect } from "vitest";
import { filterResults, enrichWithCda, buildContext } from "@/lib/engines";
import type { TmdbSearchResult } from "@/lib/tmdb";
import type { Movie } from "@/lib/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// filterResults
// ---------------------------------------------------------------------------

describe("filterResults", () => {
  it("passes through results not in library, not dismissed, not seen", () => {
    const ctx = buildContext([], new Set());
    const results = [makeResult({ tmdb_id: 1, title: "Film A" })];
    expect(filterResults(results, ctx)).toHaveLength(1);
  });

  it("filters out results already in library by tmdb_id", () => {
    const library = [makeMovie({ id: 1, title: "Film", tmdb_id: 100 })];
    const ctx = buildContext(library, new Set());
    const results = [makeResult({ tmdb_id: 100, title: "Film" })];
    expect(filterResults(results, ctx)).toHaveLength(0);
  });

  it("filters out results already in library by title (case-insensitive)", () => {
    const library = [makeMovie({ id: 1, title: "Inception", tmdb_id: 999 })];
    const ctx = buildContext(library, new Set());
    const results = [makeResult({ tmdb_id: 5, title: "inception" })];
    expect(filterResults(results, ctx)).toHaveLength(0);
  });

  it("filters out dismissed results", () => {
    const ctx = buildContext([], new Set([42]));
    const results = [
      makeResult({ tmdb_id: 42, title: "Dismissed" }),
      makeResult({ tmdb_id: 43, title: "Visible" }),
    ];
    expect(filterResults(results, ctx)).toHaveLength(1);
    expect(filterResults(results, ctx)[0].title).toBe("Visible");
  });

  it("deduplicates results using the seen set", () => {
    const ctx = buildContext([], new Set());
    const seen = new Set<number>();
    const results = [
      makeResult({ tmdb_id: 10, title: "Film A" }),
      makeResult({ tmdb_id: 10, title: "Film A" }), // duplicate
    ];
    const filtered = filterResults(results, ctx, seen);
    expect(filtered).toHaveLength(1);
    expect(seen.has(10)).toBe(true);
  });

  it("respects min_year config", () => {
    const ctx = buildContext([], new Set(), {
      excluded_genres: [],
      min_year: 2000,
      min_rating: null,
      max_per_group: 10,
    });
    const results = [
      makeResult({ tmdb_id: 1, title: "Old Film", year: 1985 }),
      makeResult({ tmdb_id: 2, title: "New Film", year: 2005 }),
    ];
    const filtered = filterResults(results, ctx);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("New Film");
  });

  it("allows result with no year when min_year is set", () => {
    const ctx = buildContext([], new Set(), {
      excluded_genres: [],
      min_year: 2000,
      min_rating: null,
      max_per_group: 10,
    });
    const results = [makeResult({ tmdb_id: 1, title: "Timeless", year: null as unknown as number })];
    const filtered = filterResults(results, ctx);
    expect(filtered).toHaveLength(1);
  });

  it("respects min_rating config", () => {
    const ctx = buildContext([], new Set(), {
      excluded_genres: [],
      min_year: null,
      min_rating: 7.0,
      max_per_group: 10,
    });
    const results = [
      makeResult({ tmdb_id: 1, title: "Low Rated", rating: 5.0 }),
      makeResult({ tmdb_id: 2, title: "High Rated", rating: 8.0 }),
    ];
    const filtered = filterResults(results, ctx);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("High Rated");
  });

  it("respects excluded_genres config", () => {
    const ctx = buildContext([], new Set(), {
      excluded_genres: ["Horror"],
      min_year: null,
      min_rating: null,
      max_per_group: 10,
    });
    const results = [
      makeResult({ tmdb_id: 1, title: "Scary Film", genre: "Horror" }),
      makeResult({ tmdb_id: 2, title: "Safe Film", genre: "Comedy" }),
    ];
    const filtered = filterResults(results, ctx);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Safe Film");
  });

  it("excluded_genres check is case-insensitive", () => {
    const ctx = buildContext([], new Set(), {
      excluded_genres: ["horror"],
      min_year: null,
      min_rating: null,
      max_per_group: 10,
    });
    const results = [makeResult({ tmdb_id: 1, title: "Scary Film", genre: "Horror" })];
    expect(filterResults(results, ctx)).toHaveLength(0);
  });

  it("passes results with no genre when excluded_genres is set", () => {
    const ctx = buildContext([], new Set(), {
      excluded_genres: ["Horror"],
      min_year: null,
      min_rating: null,
      max_per_group: 10,
    });
    const results = [makeResult({ tmdb_id: 1, title: "Genreless", genre: null as unknown as string })];
    expect(filterResults(results, ctx)).toHaveLength(1);
  });

  it("handles multi-genre results — excludes if any genre matches excluded list", () => {
    const ctx = buildContext([], new Set(), {
      excluded_genres: ["Horror"],
      min_year: null,
      min_rating: null,
      max_per_group: 10,
    });
    const results = [makeResult({ tmdb_id: 1, title: "Mixed", genre: "Drama, Horror" })];
    expect(filterResults(results, ctx)).toHaveLength(0);
  });

  it("adds accepted results to the shared seen set", () => {
    const ctx = buildContext([], new Set());
    const seen = new Set<number>();
    filterResults([makeResult({ tmdb_id: 77, title: "Film" })], ctx, seen);
    expect(seen.has(77)).toBe(true);
  });

  it("returns empty array when all results are filtered", () => {
    const ctx = buildContext([], new Set([1, 2, 3]));
    const results = [1, 2, 3].map((id) => makeResult({ tmdb_id: id, title: `Film ${id}` }));
    expect(filterResults(results, ctx)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// enrichWithCda
// ---------------------------------------------------------------------------

describe("enrichWithCda", () => {
  it("returns unchanged results when lookup is empty", () => {
    const results = [makeResult({ tmdb_id: 1, title: "Film" })];
    const lookup = { byTmdbId: new Map(), byTitle: new Map() };
    const enriched = enrichWithCda(results, lookup);
    expect(enriched[0]).toEqual(results[0]);
  });

  it("enriches result with cda_url matched by tmdb_id", () => {
    const results = [makeResult({ tmdb_id: 42, title: "Film" })];
    const lookup = {
      byTmdbId: new Map([[42, "https://cda.pl/video/abc"]]),
      byTitle: new Map<string, string>(),
    };
    const enriched = enrichWithCda(results, lookup);
    expect(enriched[0].cda_url).toBe("https://cda.pl/video/abc");
  });

  it("enriches result with cda_url matched by title (case-insensitive)", () => {
    const results = [makeResult({ tmdb_id: 99, title: "Inception" })];
    const lookup = {
      byTmdbId: new Map<number, string>(),
      byTitle: new Map([["inception", "https://cda.pl/video/xyz"]]),
    };
    const enriched = enrichWithCda(results, lookup);
    expect(enriched[0].cda_url).toBe("https://cda.pl/video/xyz");
  });

  it("prefers tmdb_id match over title match", () => {
    const results = [makeResult({ tmdb_id: 10, title: "Film" })];
    const lookup = {
      byTmdbId: new Map([[10, "https://cda.pl/by-id"]]),
      byTitle: new Map([["film", "https://cda.pl/by-title"]]),
    };
    const enriched = enrichWithCda(results, lookup);
    expect(enriched[0].cda_url).toBe("https://cda.pl/by-id");
  });

  it("does not mutate original result objects", () => {
    const original = makeResult({ tmdb_id: 5, title: "Film" });
    const results = [original];
    const lookup = {
      byTmdbId: new Map([[5, "https://cda.pl/video/new"]]),
      byTitle: new Map<string, string>(),
    };
    enrichWithCda(results, lookup);
    expect(original).not.toHaveProperty("cda_url");
  });

  it("leaves results without a match unchanged", () => {
    const results = [makeResult({ tmdb_id: 1, title: "Unknown Film" })];
    const lookup = {
      byTmdbId: new Map([[99, "https://cda.pl/other"]]),
      byTitle: new Map([["other film", "https://cda.pl/other2"]]),
    };
    const enriched = enrichWithCda(results, lookup);
    expect(enriched[0].cda_url).toBeUndefined();
  });

  it("handles empty results array", () => {
    const lookup = { byTmdbId: new Map(), byTitle: new Map() };
    expect(enrichWithCda([], lookup)).toEqual([]);
  });

  it("enriches multiple results independently", () => {
    const results = [
      makeResult({ tmdb_id: 1, title: "Film A" }),
      makeResult({ tmdb_id: 2, title: "Film B" }),
      makeResult({ tmdb_id: 3, title: "Film C" }),
    ];
    const lookup = {
      byTmdbId: new Map([[1, "https://cda.pl/a"], [3, "https://cda.pl/c"]]),
      byTitle: new Map<string, string>(),
    };
    const enriched = enrichWithCda(results, lookup);
    expect(enriched[0].cda_url).toBe("https://cda.pl/a");
    expect(enriched[1].cda_url).toBeUndefined();
    expect(enriched[2].cda_url).toBe("https://cda.pl/c");
  });
});

// ---------------------------------------------------------------------------
// buildContext
// ---------------------------------------------------------------------------

describe("buildContext", () => {
  it("returns the library and dismissedIds unchanged", () => {
    const library = [makeMovie({ id: 1, title: "Inception" })];
    const dismissed = new Set([42]);
    const ctx = buildContext(library, dismissed);
    expect(ctx.library).toBe(library);
    expect(ctx.dismissedIds).toBe(dismissed);
  });

  it("builds libraryTmdbIds from non-null tmdb_ids", () => {
    const library = [
      makeMovie({ id: 1, title: "Film A", tmdb_id: 111 }),
      makeMovie({ id: 2, title: "Film B", tmdb_id: 222 }),
      makeMovie({ id: 3, title: "Film C", tmdb_id: null as unknown as number }),
    ];
    const ctx = buildContext(library, new Set());
    expect(ctx.libraryTmdbIds.has(111)).toBe(true);
    expect(ctx.libraryTmdbIds.has(222)).toBe(true);
    // null tmdb_id should be excluded
    expect(ctx.libraryTmdbIds.size).toBe(2);
  });

  it("builds libraryTitles as lowercase set", () => {
    const library = [
      makeMovie({ id: 1, title: "Inception" }),
      makeMovie({ id: 2, title: "THE MATRIX" }),
    ];
    const ctx = buildContext(library, new Set());
    expect(ctx.libraryTitles.has("inception")).toBe(true);
    expect(ctx.libraryTitles.has("the matrix")).toBe(true);
    expect(ctx.libraryTitles.has("Inception")).toBe(false);
  });

  it("attaches config when provided", () => {
    const config = { excluded_genres: ["Horror"], min_year: 2000, min_rating: 7, max_per_group: 10 };
    const ctx = buildContext([], new Set(), config);
    expect(ctx.config).toBe(config);
  });

  it("leaves config undefined when not provided", () => {
    const ctx = buildContext([], new Set());
    expect(ctx.config).toBeUndefined();
  });

  it("handles empty library gracefully", () => {
    const ctx = buildContext([], new Set());
    expect(ctx.libraryTmdbIds.size).toBe(0);
    expect(ctx.libraryTitles.size).toBe(0);
  });
});
