import { describe, expect, it } from "vitest";
import { getSearchMatches, shouldAutoSearchTmdb } from "@/lib/search";
import type { Movie } from "@/lib/types";

function makeMovie(overrides: Partial<Movie>): Movie {
  return {
    id: overrides.id ?? 1,
    title: overrides.title ?? "Inception",
    year: overrides.year ?? 2010,
    genre: overrides.genre ?? "Sci-Fi",
    director: overrides.director ?? null,
    writer: overrides.writer ?? null,
    actors: overrides.actors ?? null,
    rating: overrides.rating ?? 8.8,
    user_rating: overrides.user_rating ?? null,
    poster_url: overrides.poster_url ?? null,
    source: overrides.source ?? "tmdb",
    type: overrides.type ?? "movie",
    tmdb_id: overrides.tmdb_id ?? 100,
    rated_at: overrides.rated_at ?? null,
    created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
    filmweb_url: overrides.filmweb_url ?? null,
    cda_url: overrides.cda_url ?? null,
    pl_title: overrides.pl_title ?? null,
    wishlist: overrides.wishlist ?? 0,
    file_path: overrides.file_path ?? null,
  };
}

describe("search utils", () => {
  it("splits library and watchlist matches for a shared query", () => {
    const movies = [
      makeMovie({ id: 1, title: "Alien", wishlist: 0 }),
      makeMovie({ id: 2, title: "Alien: Covenant", wishlist: 1 }),
    ];

    const { libraryMatches, wishlistMatches } = getSearchMatches(
      movies,
      "alien",
    );

    expect(libraryMatches.map((movie) => movie.id)).toEqual([1]);
    expect(wishlistMatches.map((movie) => movie.id)).toEqual([2]);
  });

  it("does not auto-search TMDb when the query already matches local titles", () => {
    const movies = [
      makeMovie({ id: 1, title: "Alien", wishlist: 0 }),
      makeMovie({ id: 2, title: "Aliens", wishlist: 1 }),
    ];

    expect(shouldAutoSearchTmdb(movies, "alien")).toBe(false);
  });

  it("auto-searches TMDb when the query has no local matches", () => {
    const movies = [
      makeMovie({ id: 1, title: "Alien", wishlist: 0 }),
      makeMovie({ id: 2, title: "Aliens", wishlist: 1 }),
    ];

    expect(shouldAutoSearchTmdb(movies, "blade runner")).toBe(true);
  });
});
