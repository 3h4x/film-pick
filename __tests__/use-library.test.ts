import { describe, expect, it } from "vitest";
import { buildWishlistActionRequest } from "@/lib/hooks/useLibrary";
import type { Movie } from "@/lib/types";

function makeMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 42,
    title: "Priscilla",
    year: 2023,
    genre: "Drama, Romance",
    director: null,
    writer: null,
    actors: null,
    rating: 6.7,
    user_rating: null,
    poster_url: null,
    source: "tmdb",
    tmdb_id: 1022796,
    type: "movie",
    file_path: null,
    filmweb_url: null,
    cda_url: null,
    pl_title: null,
    rated_at: null,
    created_at: "2026-05-12T00:00:00.000Z",
    wishlist: 1,
    ...overrides,
  };
}

describe("buildWishlistActionRequest", () => {
  it("clears wishlist without setting a rating when removing from watchlist", () => {
    const movie = makeMovie();

    const result = buildWishlistActionRequest(movie, "remove");

    expect(result.nextMovie.wishlist).toBe(0);
    expect(result.nextMovie.user_rating).toBeNull();
    expect(result.requestBody).toEqual({ wishlist: 0 });
    expect(result.toast).toBe('Removed "Priscilla" from watchlist');
  });

  it("moves a liked watchlist movie into the library with a rating", () => {
    const movie = makeMovie();

    const result = buildWishlistActionRequest(movie, "liked");

    expect(result.nextMovie.wishlist).toBe(0);
    expect(result.nextMovie.user_rating).toBe(8);
    expect(result.requestBody).toEqual({ user_rating: 8, wishlist: 0 });
  });
});
