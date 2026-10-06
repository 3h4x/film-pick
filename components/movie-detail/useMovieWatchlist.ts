"use client";

import { useEffect, useState } from "react";
import type { MovieDetailMovie } from "@/components/movie-detail/types";

interface UseMovieWatchlistOptions {
  movie: MovieDetailMovie;
  movieTitle: string;
  director: string | null;
  posterUrl: string | null;
  isPersistedMovie: boolean;
  onUpdate?: (updatedMovie: MovieDetailMovie) => void;
}

/**
 * "Want to watch": toggles `wishlist` on a library film, or saves a film opened
 * from TMDb (not in the library yet) straight onto the watchlist.
 */
export function useMovieWatchlist({
  movie,
  movieTitle,
  director,
  posterUrl,
  isPersistedMovie,
  onUpdate,
}: UseMovieWatchlistOptions) {
  const [onWatchlist, setOnWatchlist] = useState(movie.wishlist === 1);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setOnWatchlist(movie.wishlist === 1);
    setIsSaving(false);
  }, [movie]);

  const toggleWatchlist = async () => {
    setIsSaving(true);
    try {
      if (!isPersistedMovie) {
        const createRes = await fetch("/api/movies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: movieTitle,
            year: movie.year,
            genre: movie.genre,
            director,
            rating: movie.rating,
            poster_url: posterUrl,
            source: movie.source || "tmdb",
            imdb_id: movie.imdb_id ?? null,
            tmdb_id: movie.tmdb_id ?? null,
            type: movie.type || "movie",
            wishlist: 1,
            cda_url: movie.cda_url || null,
          }),
        });
        if (!createRes.ok) return;
        const { id } = (await createRes.json()) as { id: number };
        const movieRes = await fetch(`/api/movies/${id}`);
        const detail = (await movieRes.json()) as { movie?: MovieDetailMovie };
        setOnWatchlist(true);
        onUpdate?.(detail.movie ?? { ...movie, id, wishlist: 1 });
        return;
      }

      const next = onWatchlist ? 0 : 1;
      const res = await fetch(`/api/movies/${movie.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wishlist: next }),
      });
      if (!res.ok) return;
      setOnWatchlist(next === 1);
      onUpdate?.((await res.json()) as MovieDetailMovie);
    } catch (error) {
      console.error("Failed to update watchlist:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return { onWatchlist, isSavingWatchlist: isSaving, toggleWatchlist };
}
