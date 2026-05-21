// tamtam inspected 2026-05-21
import type { Movie } from "@/lib/types";

export type QuickRateAction =
  | { kind: "rate"; rating: number }
  | { kind: "skip" }
  | { kind: "wishlist" }
  | { kind: "dismiss" }
  | { kind: "exit" };

export function isUnratedMovie(movie: Movie) {
  return movie.user_rating == null || movie.user_rating === 0;
}

export function nextUnratedMovie(
  movies: Movie[],
  currentId: number | null,
): Movie | null {
  const unratedMovies = movies.filter(isUnratedMovie);
  if (unratedMovies.length === 0) return null;
  if (currentId == null) return unratedMovies[0] ?? null;

  const currentIndex = unratedMovies.findIndex((movie) => movie.id === currentId);
  if (currentIndex === -1) return unratedMovies[0] ?? null;

  return unratedMovies[currentIndex + 1] ?? null;
}

export function mapQuickRateKey(key: string): QuickRateAction | null {
  if (key >= "1" && key <= "9") {
    return { kind: "rate", rating: Number(key) };
  }
  if (key === "0") {
    return { kind: "rate", rating: 10 };
  }

  switch (key.toLowerCase()) {
    case "s":
      return { kind: "skip" };
    case "w":
      return { kind: "wishlist" };
    case "d":
      return { kind: "dismiss" };
    case "escape":
      return { kind: "exit" };
    default:
      return null;
  }
}
