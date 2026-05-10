"use client";
import { useState } from "react";
import { shouldAutoSearchTmdb } from "@/lib/search";
import type { Movie } from "@/lib/types";
import type { TmdbSearchResult } from "@/lib/tmdb";
import { cleanTitle } from "@/lib/utils";

interface UseSearchParams {
  movies: Movie[];
  setMovies: React.Dispatch<React.SetStateAction<Movie[]>>;
  selectedMovie: Movie | null;
  setSelectedMovie: (movie: Movie | null) => void;
  addToast: (message: string, variant?: "default" | "success") => void;
  setSearchOpen: (open: boolean) => void;
}

export function useSearch({
  movies,
  setMovies,
  selectedMovie,
  setSelectedMovie,
  addToast,
  setSearchOpen,
}: UseSearchParams) {
  const [searchTargetId, setSearchTargetId] = useState<number | null>(null);
  const [tmdbResults, setTmdbResults] = useState<TmdbSearchResult[]>([]);
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [tmdbAdded, setTmdbAdded] = useState<Set<number>>(new Set());
  const [tmdbError, setTmdbError] = useState<string | null>(null);
  const [tmdbSearched, setTmdbSearched] = useState(false);

  async function runTmdbSearch(query: string) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    setTmdbLoading(true);
    setTmdbError(null);
    setTmdbSearched(true);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`);
      if (res.ok) {
        setTmdbResults(await res.json());
      } else {
        const body = await res.json().catch(() => ({}));
        setTmdbError(body.error === "no_api_key" ? "no_api_key" : "error");
      }
    } catch {
      setTmdbError("error");
    } finally {
      setTmdbLoading(false);
    }
  }

  async function handleAddMovie(
    searchResult: TmdbSearchResult,
    isWishlist: boolean,
  ) {
    if (searchTargetId) {
      const res = await fetch(`/api/movies/${searchTargetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: searchResult.title,
          year: searchResult.year,
          genre: searchResult.genre,
          rating: searchResult.rating,
          poster_url: searchResult.poster_url,
          tmdb_id: searchResult.tmdb_id,
          imdb_id: searchResult.imdb_id,
          source: "tmdb",
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setMovies((prev) =>
          prev.map((m) => (m.id === searchTargetId ? { ...m, ...updated } : m)),
        );
        addToast(`Updated metadata for "${searchResult.title}"`);
        if (selectedMovie && selectedMovie.id === searchTargetId) {
          setSelectedMovie({ ...selectedMovie, ...updated });
        }
      } else {
        const error = await res.json();
        if (
          error.code === "SQLITE_CONSTRAINT_UNIQUE" ||
          error.error?.includes("UNIQUE constraint failed")
        ) {
          const cleanSearchTitle = cleanTitle(searchResult.title).toLowerCase();
          const existing = movies.find(
            (m) =>
              m.id !== searchTargetId &&
              ((m.tmdb_id && m.tmdb_id === searchResult.tmdb_id) ||
                (cleanTitle(m.title).toLowerCase() === cleanSearchTitle &&
                  m.year === searchResult.year)),
          );

          if (existing) {
            if (
              confirm(
                `"${searchResult.title}" already exists in your library as a separate entry. Do you want to merge these two records?`,
              )
            ) {
              const mergeRes = await fetch("/api/movies/merge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sourceId: searchTargetId,
                  targetId: existing.id,
                }),
              });

              if (mergeRes.ok) {
                addToast("Movies merged successfully");
                const refreshedRes = await fetch(
                  `/api/movies/${existing.id}`,
                );
                if (refreshedRes.ok) {
                  const refreshed = await refreshedRes.json();
                  const updatedMovie = refreshed.movie || existing;
                  setMovies((prev) =>
                    prev
                      .filter((m) => m.id !== searchTargetId)
                      .map((m) => (m.id === existing.id ? updatedMovie : m)),
                  );
                  setSelectedMovie(updatedMovie);
                } else {
                  setMovies((prev) =>
                    prev.filter((m) => m.id !== searchTargetId),
                  );
                  setSelectedMovie(null);
                }
              } else {
                addToast("Failed to merge movies");
              }
            }
          } else {
            addToast(
              `Error updating metadata: ${error.error || "Conflict"}`,
            );
          }
        } else {
          addToast(`Error: ${error.error || "Failed to update metadata"}`);
        }
      }

      setSearchOpen(false);
      setSearchTargetId(null);
      return;
    }

    const cleanSearchTitle = cleanTitle(searchResult.title).toLowerCase();
    const existing = movies.find(
      (m) =>
        (m.tmdb_id && m.tmdb_id === searchResult.tmdb_id) ||
        (cleanTitle(m.title).toLowerCase() === cleanSearchTitle &&
          m.year === searchResult.year),
    );

    if (existing && !isWishlist) {
      if (
        confirm(
          `"${searchResult.title}" is already in your library. Do you want to update its metadata instead?`,
        )
      ) {
        setSearchTargetId(existing.id);
        handleAddMovie(searchResult, false);
        return;
      }
    }

    const res = await fetch("/api/movies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: searchResult.title,
        year: searchResult.year,
        genre: searchResult.genre,
        director: null,
        rating: searchResult.rating,
        poster_url: searchResult.poster_url,
        source: "tmdb",
        imdb_id: searchResult.imdb_id,
        tmdb_id: searchResult.tmdb_id,
        type: "movie",
        wishlist: isWishlist ? 1 : 0,
      }),
    });
    const data = await res.json();
    setSearchOpen(false);

    const newMovie: Movie = {
      id: data.id || Date.now(),
      title: searchResult.title,
      year: searchResult.year,
      genre: searchResult.genre,
      director: null,
      writer: null,
      actors: null,
      rating: searchResult.rating,
      user_rating: null,
      poster_url: searchResult.poster_url,
      source: "tmdb",
      type: "movie",
      tmdb_id: searchResult.tmdb_id,
      rated_at: null,
      created_at: new Date().toISOString(),
      wishlist: isWishlist ? 1 : 0,
    };
    setMovies((prev) => [newMovie, ...prev]);
    addToast(
      isWishlist
        ? `Added "${searchResult.title}" to watchlist`
        : `Added "${searchResult.title}" to library`,
    );
  }

  async function handleNavSearch(
    query: string,
    options?: { forceTmdb?: boolean },
  ) {
    setTmdbResults([]);
    setTmdbError(null);
    setTmdbAdded(new Set());
    setTmdbSearched(false);

    if (options?.forceTmdb) {
      await runTmdbSearch(query);
      return;
    }

    if (shouldAutoSearchTmdb(movies, query)) {
      await runTmdbSearch(query);
    }
  }

  return {
    searchTargetId,
    setSearchTargetId,
    tmdbResults,
    setTmdbResults,
    tmdbLoading,
    setTmdbLoading,
    tmdbAdded,
    setTmdbAdded,
    tmdbError,
    setTmdbError,
    tmdbSearched,
    runTmdbSearch,
    handleAddMovie,
    handleNavSearch,
  };
}
