"use client";
// tamtam inspected 2026-05-21
import { useState, useCallback, useMemo, useEffect } from "react";
import type { Movie, SortOption } from "@/lib/types";
import { PAGE_SIZE } from "@/lib/types";
import {
  filterMovies,
  sortMovies,
  extractGenres,
  extractSources,
  extractYears,
} from "@/lib/utils";

type WishlistAction = "liked" | "watched" | "disliked" | "remove";

export function buildWishlistActionRequest(
  movie: Movie,
  action: WishlistAction,
): {
  nextMovie: Movie;
  requestBody: { wishlist: 0 | 1; user_rating?: number };
  toast: string;
} {
  if (action === "remove") {
    return {
      nextMovie: { ...movie, wishlist: 0 },
      requestBody: { wishlist: 0 },
      toast: `Removed "${movie.title}" from watchlist`,
    };
  }

  const userRating = action === "liked" ? 8 : action === "disliked" ? 3 : 5;
  const actionLabels = {
    liked: `Liked "${movie.title}" — moved to library`,
    watched: `Marked "${movie.title}" as watched`,
    disliked: `Disliked "${movie.title}" — moved to library`,
  } satisfies Record<Exclude<WishlistAction, "remove">, string>;

  return {
    nextMovie: { ...movie, user_rating: userRating, wishlist: 0 },
    requestBody: { user_rating: userRating, wishlist: 0 },
    toast: actionLabels[action],
  };
}

export function useLibrary(
  addToast: (message: string, variant?: "default" | "success") => void,
) {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [sort, setSort] = useState<SortOption>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [genreFilter, setGenreFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [unratedOnly, setUnratedOnly] = useState(false);
  const [hasFileOnly, setHasFileOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sort, sortDir, genreFilter, sourceFilter, yearFilter, unratedOnly, hasFileOnly, searchQuery]);

  const genres = useMemo(() => extractGenres(movies), [movies]);
  const sources = useMemo(() => extractSources(movies), [movies]);
  const years = useMemo(() => extractYears(movies), [movies]);

  const sortedMovies = useMemo(() => {
    const filtered = filterMovies(movies, {
      searchQuery,
      genreFilter,
      sourceFilter,
      yearFilter,
      unratedOnly,
      hasFileOnly,
    });
    return sortMovies(filtered, sort, sortDir);
  }, [movies, sort, sortDir, genreFilter, sourceFilter, yearFilter, unratedOnly, hasFileOnly, searchQuery]);

  const visibleMovies = useMemo(
    () => sortedMovies.slice(0, visibleCount),
    [sortedMovies, visibleCount],
  );

  const wishlistMovies = useMemo(
    () => movies.filter((m) => m.wishlist === 1 && !m.user_rating),
    [movies],
  );

  const fetchMovies = useCallback(async () => {
    try {
      const res = await fetch("/api/movies");
      const data = await res.json();
      setMovies(data);
      setInitialLoad(false);
    } catch (err) {
      console.error("[movies-organizer] fetchMovies: error", err);
    }
  }, []);

  const patchMovie = useCallback(
    async (
      id: number,
      updates: Partial<Pick<Movie, "user_rating" | "wishlist" | "rated_at">>,
    ) => {
      const previousMovie = movies.find((movie) => movie.id === id);

      if (previousMovie) {
        setMovies((prev) =>
          prev.map((movie) =>
            movie.id === id ? { ...movie, ...updates } : movie,
          ),
        );
      }

      try {
        const res = await fetch(`/api/movies/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });

        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: "Failed to update movie" }));
          throw new Error(typeof error.error === "string" ? error.error : "Failed to update movie");
        }

        const updatedMovie = (await res.json()) as Movie;
        setMovies((prev) =>
          prev.map((movie) => (movie.id === id ? updatedMovie : movie)),
        );
        return updatedMovie;
      } catch (error) {
        if (previousMovie) {
          setMovies((prev) =>
            prev.map((movie) => (movie.id === id ? previousMovie : movie)),
          );
        }
        console.error("[movies-organizer] patchMovie: error", error);
        addToast("Failed to update movie");
        return null;
      }
    },
    [addToast, movies],
  );

  function handleDeleteMovie(id: number, title: string) {
    setMovies((prev) => prev.filter((m) => m.id !== id));
    fetch(`/api/movies/${id}`, { method: "DELETE" });
    addToast(`Removed "${title}"`);
  }

  function handleMoveToWatchlist(id: number, title: string) {
    setMovies((prev) =>
      prev.map((m) => (m.id === id ? { ...m, wishlist: 1 } : m)),
    );
    fetch(`/api/movies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wishlist: 1 }),
    });
    addToast(`Moved "${title}" to watchlist`);
  }

  async function handleWishlistAction(
    movie: Movie,
    action: WishlistAction,
  ) {
    const { nextMovie, requestBody, toast } = buildWishlistActionRequest(
      movie,
      action,
    );

    addToast(toast);
    setMovies((prev) =>
      prev.map((m) => (m.id === movie.id ? nextMovie : m)),
    );
    fetch(`/api/movies/${movie.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  }

  async function handleQuickRate(movie: Movie, rating: number) {
    const updatedMovie = await patchMovie(movie.id, {
      user_rating: rating,
      wishlist: 0,
    });
    if (!updatedMovie) return false;
    addToast(`Rated "${movie.title}" ${rating}/10`, "success");
    return true;
  }

  async function handleToggleWishlist(movie: Movie) {
    const nextWishlist = movie.wishlist === 1 ? 0 : 1;
    const updatedMovie = await patchMovie(movie.id, { wishlist: nextWishlist });
    if (!updatedMovie) return false;
    addToast(
      nextWishlist === 1
        ? `Added "${movie.title}" to watchlist`
        : `Removed "${movie.title}" from watchlist`,
      "success",
    );
    return true;
  }

  return {
    movies,
    setMovies,
    fetchMovies,
    initialLoad,
    sort,
    setSortOption: setSort,
    sortDir,
    toggleSortDir: () => setSortDir((d) => (d === "desc" ? "asc" : "desc")),
    genreFilter,
    setGenreFilter,
    sourceFilter,
    setSourceFilter,
    yearFilter,
    setYearFilter,
    unratedOnly,
    setUnratedOnly,
    hasFileOnly,
    setHasFileOnly,
    searchQuery,
    setSearchQuery,
    visibleCount,
    setVisibleCount,
    sortedMovies,
    visibleMovies,
    genres,
    sources,
    years,
    wishlistMovies,
    handleDeleteMovie,
    handleMoveToWatchlist,
    handleWishlistAction,
    handleQuickRate,
    handleToggleWishlist,
  };
}
