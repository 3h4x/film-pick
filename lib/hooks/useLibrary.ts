"use client";
import { useState, useCallback, useMemo, useEffect } from "react";
import type { Movie, SortOption } from "@/lib/types";
import { PAGE_SIZE } from "@/lib/types";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sort, sortDir, genreFilter, sourceFilter, yearFilter, unratedOnly, searchQuery]);

  const genres = useMemo(() => {
    const all = new Set<string>();
    movies.forEach((m) => {
      if (m.genre) m.genre.split(", ").forEach((g) => all.add(g.trim()));
    });
    return Array.from(all).sort();
  }, [movies]);

  const sources = useMemo(() => {
    const all = new Set<string>();
    movies.forEach((m) => {
      if (m.source) all.add(m.source);
    });
    return Array.from(all).sort();
  }, [movies]);

  const years = useMemo(() => {
    const all = new Set<number>();
    movies.forEach((m) => {
      if (m.year) all.add(m.year);
    });
    return Array.from(all).sort((a, b) => b - a);
  }, [movies]);

  const sortedMovies = useMemo(() => {
    let filtered = movies.filter(
      (m) =>
        m.source !== "recommendation" ||
        (m.user_rating != null && (m.user_rating as number) > 0),
    );
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.pl_title?.toLowerCase().includes(q),
      );
    }
    if (genreFilter) filtered = filtered.filter((m) => m.genre?.includes(genreFilter));
    if (sourceFilter) filtered = filtered.filter((m) => m.source === sourceFilter);
    if (yearFilter) filtered = filtered.filter((m) => m.year?.toString() === yearFilter);
    if (unratedOnly) filtered = filtered.filter((m) => !m.user_rating || m.user_rating === 0);
    return [...filtered].sort((a, b) => {
      const dir = sortDir === "desc" ? -1 : 1;
      switch (sort) {
        case "user_rating":
          return dir * ((a.user_rating ?? -1) - (b.user_rating ?? -1));
        case "rating":
          return dir * ((a.rating ?? 0) - (b.rating ?? 0));
        case "year":
          return dir * ((a.year ?? 0) - (b.year ?? 0));
        case "title":
          return dir * a.title.localeCompare(b.title);
        case "created_at":
          return dir * a.created_at.localeCompare(b.created_at);
        case "rated_at":
          return dir * (a.rated_at ?? "").localeCompare(b.rated_at ?? "");
        default:
          return 0;
      }
    });
  }, [movies, sort, sortDir, genreFilter, sourceFilter, yearFilter, unratedOnly, searchQuery]);

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
    action: "liked" | "watched" | "disliked" | "remove",
  ) {
    if (action === "remove") {
      handleDeleteMovie(movie.id, movie.title);
      return;
    }
    const userRating = action === "liked" ? 8 : action === "disliked" ? 3 : 5;
    const actionLabels = {
      liked: `Liked "${movie.title}" — moved to library`,
      watched: `Marked "${movie.title}" as watched`,
      disliked: `Disliked "${movie.title}" — moved to library`,
    };
    addToast(actionLabels[action]);
    setMovies((prev) =>
      prev.map((m) =>
        m.id === movie.id ? { ...m, user_rating: userRating, wishlist: 0 } : m,
      ),
    );
    fetch(`/api/movies/${movie.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_rating: userRating, wishlist: 0 }),
    });
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
  };
}
