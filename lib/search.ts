import type { Movie } from "@/lib/types";

export interface SearchMatches {
  libraryMatches: Movie[];
  wishlistMatches: Movie[];
}

export function getSearchMatches(
  movies: Movie[],
  rawQuery: string,
): SearchMatches {
  const query = rawQuery.trim().toLowerCase();

  if (!query) {
    return { libraryMatches: [], wishlistMatches: [] };
  }

  const matchesQuery = (movie: Movie) =>
    movie.title.toLowerCase().includes(query) ||
    movie.pl_title?.toLowerCase().includes(query);

  const libraryMatches = movies
    .filter(
      (movie) =>
        (movie.source !== "recommendation" ||
          (movie.user_rating != null && movie.user_rating > 0)) &&
        !movie.wishlist,
    )
    .filter(matchesQuery);

  const wishlistMatches = movies
    .filter((movie) => movie.wishlist === 1)
    .filter(matchesQuery);

  return { libraryMatches, wishlistMatches };
}

export function shouldAutoSearchTmdb(movies: Movie[], rawQuery: string) {
  const { libraryMatches, wishlistMatches } = getSearchMatches(movies, rawQuery);
  return libraryMatches.length === 0 && wishlistMatches.length === 0;
}
