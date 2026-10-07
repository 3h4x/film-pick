"use client";

import { useEffect, useState } from "react";
import type { MovieDetailMovie } from "@/components/movie-detail/types";

interface UseMovieDismissOptions {
  movie: MovieDetailMovie;
  movieTitle: string;
  plTitle: string | null;
}

/**
 * "Not interested": the same dismissal a recommendation's ✕ records (title included,
 * so tpb can show it), toggled from the movie or series detail. Needs a TMDb id.
 */
export function useMovieDismiss({ movie, movieTitle, plTitle }: UseMovieDismissOptions) {
  // TMDb numbers series separately from films, so series are dismissed with media_type=tv.
  const isTv = movie.type === "tv" || movie.type === "series";
  const mediaType = isTv ? "tv" : "movie";
  const tmdbId = movie.tmdb_id ?? null;
  const [dismissed, setDismissed] = useState(false);
  const [isSavingDismiss, setIsSavingDismiss] = useState(false);

  useEffect(() => {
    setDismissed(false);
    if (!tmdbId) return;
    let current = true;
    void (async () => {
      try {
        const res = await fetch(`/api/recommendations/dismiss?tmdb_id=${tmdbId}&media_type=${mediaType}`);
        if (!res.ok) return;
        const data = (await res.json()) as { dismissed?: boolean };
        if (current) setDismissed(Boolean(data.dismissed));
      } catch {
        // the toggle just starts as "not dismissed"
      }
    })();
    return () => {
      current = false;
    };
  }, [tmdbId, mediaType]);

  /** Resolves to the new state, or null when nothing changed. */
  const toggleDismiss = async (): Promise<boolean | null> => {
    if (!tmdbId) return null;
    setIsSavingDismiss(true);
    try {
      const next = !dismissed;
      const res = next
        ? await fetch("/api/recommendations/dismiss", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tmdb_id: tmdbId,
              media_type: mediaType,
              engine: "detail",
              title: movieTitle,
              year: movie.year,
              pl_title: plTitle,
            }),
          })
        : await fetch(`/api/recommendations/dismiss?tmdb_id=${tmdbId}&media_type=${mediaType}`, {
            method: "DELETE",
          });
      if (!res.ok) return null;
      setDismissed(next);
      return next;
    } catch (error) {
      console.error("Failed to update not-interested:", error);
      return null;
    } finally {
      setIsSavingDismiss(false);
    }
  };

  return { dismissed, isSavingDismiss, canDismiss: tmdbId != null, toggleDismiss };
}
