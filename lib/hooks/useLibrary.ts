"use client";
// tamtam inspected 2026-05-21
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { Movie, SortOption } from "@/lib/types";
import { PAGE_SIZE } from "@/lib/types";
import { createLatestOnlyRunner } from "@/lib/latest-only-runner";
import { readLibraryCache, writeLibraryCache } from "@/lib/library-cache";
import { readLibraryViewPrefs, writeLibraryViewPrefs } from "@/lib/library-view-prefs";
import {
  filterMovies,
  sortMovies,
  extractGenres,
  extractSources,
  extractYears,
} from "@/lib/utils";

type WishlistAction = "liked" | "watched" | "disliked" | "remove";

export async function fetchLibrarySearchMovies(
  query: string,
  signal?: AbortSignal,
): Promise<Movie[]> {
  const res = await fetch(`/api/movies?q=${encodeURIComponent(query)}`, {
    signal,
  });
  if (!res.ok) throw new Error(`Library search failed (${res.status})`);
  return (await res.json()) as Movie[];
}

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

export type MovieDeleteResult = { ok: true } | { ok: false; message: string };

/** DELETE /api/movies/:id, reporting failures instead of swallowing them. */
export async function requestMovieDelete(
  id: number,
  title: string,
): Promise<MovieDeleteResult> {
  try {
    const res = await fetch(`/api/movies/${id}`, { method: "DELETE" });
    if (res.ok) return { ok: true };
    if (res.status === 429) {
      let retry = Number(res.headers.get("Retry-After"));
      if (!Number.isFinite(retry) || retry <= 0) {
        const body = (await res.json().catch(() => null)) as {
          retry_after?: number;
        } | null;
        retry = Number(body?.retry_after);
      }
      const wait =
        Number.isFinite(retry) && retry > 0 ? ` Try again in ${retry}s.` : "";
      return {
        ok: false,
        message: `Too many removals at once - "${title}" was not removed.${wait}`,
      };
    }
    return { ok: false, message: `Could not remove "${title}" (${res.status})` };
  } catch {
    return { ok: false, message: `Could not remove "${title}"` };
  }
}

/** Put a movie back where it was (or at the end) unless it is already there. */
export function restoreMovieAt(
  list: Movie[],
  movie: Movie,
  index: number,
): Movie[] {
  if (list.some((m) => m.id === movie.id)) return list;
  const at = Math.min(Math.max(index, 0), list.length);
  return [...list.slice(0, at), movie, ...list.slice(at)];
}

export function useLibrary(
  addToast: (message: string, variant?: "default" | "success") => void,
) {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [searchMovies, setSearchMovies] = useState<Movie[] | null>(null);
  const [searching, setSearching] = useState(false);
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
  const searchRunnerRef = useRef(createLatestOnlyRunner<Movie[]>());

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sort, sortDir, genreFilter, sourceFilter, yearFilter, unratedOnly, hasFileOnly, searchQuery]);

  const genres = useMemo(() => extractGenres(movies), [movies]);
  const sources = useMemo(() => extractSources(movies), [movies]);
  const years = useMemo(() => extractYears(movies), [movies]);

  // Restore the last sort/filters once on mount (after hydration, so the server
  // render and the first client render agree), then save every change.
  const [viewPrefsRestored, setViewPrefsRestored] = useState(false);
  useEffect(() => {
    const saved = readLibraryViewPrefs();
    if (saved.sort) setSort(saved.sort);
    if (saved.sortDir) setSortDir(saved.sortDir);
    if (saved.genreFilter !== undefined) setGenreFilter(saved.genreFilter);
    if (saved.sourceFilter !== undefined) setSourceFilter(saved.sourceFilter);
    if (saved.yearFilter !== undefined) setYearFilter(saved.yearFilter);
    if (saved.unratedOnly !== undefined) setUnratedOnly(saved.unratedOnly);
    if (saved.hasFileOnly !== undefined) setHasFileOnly(saved.hasFileOnly);
    setViewPrefsRestored(true);
  }, []);
  useEffect(() => {
    if (!viewPrefsRestored) return;
    writeLibraryViewPrefs({ sort, sortDir, genreFilter, sourceFilter, yearFilter, unratedOnly, hasFileOnly });
  }, [viewPrefsRestored, sort, sortDir, genreFilter, sourceFilter, yearFilter, unratedOnly, hasFileOnly]);

  // A remembered genre/source/year that no longer exists in the library would
  // silently hide everything, so drop it once the library is loaded.
  useEffect(() => {
    if (initialLoad || !viewPrefsRestored) return;
    if (genreFilter && !genres.includes(genreFilter)) setGenreFilter("");
    if (sourceFilter && !sources.includes(sourceFilter)) setSourceFilter("");
    if (yearFilter && !years.includes(Number(yearFilter))) setYearFilter("");
  }, [initialLoad, viewPrefsRestored, genres, sources, years, genreFilter, sourceFilter, yearFilter]);

  const sortedMovies = useMemo(() => {
    const filtered = filterMovies(searchMovies ?? movies, {
      genreFilter,
      sourceFilter,
      yearFilter,
      unratedOnly,
      hasFileOnly,
    });
    return sortMovies(filtered, sort, sortDir);
  }, [movies, searchMovies, sort, sortDir, genreFilter, sourceFilter, yearFilter, unratedOnly, hasFileOnly]);

  const visibleMovies = useMemo(
    () => sortedMovies.slice(0, visibleCount),
    [sortedMovies, visibleCount],
  );

  const wishlistMovies = useMemo(
    () => movies.filter((m) => m.wishlist === 1 && !m.user_rating),
    [movies],
  );

  const networkLoadedRef = useRef(false);

  // Stale-while-revalidate: paint the last snapshot from IndexedDB right away,
  // then let the network response replace it.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await readLibraryCache();
      if (cancelled || !cached || networkLoadedRef.current) return;
      setMovies(cached);
      setInitialLoad(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchMovies = useCallback(async () => {
    try {
      const res = await fetch("/api/movies", { cache: "no-cache" });
      if (!res.ok) throw new Error(`Library fetch failed (${res.status})`);
      const data = (await res.json()) as Movie[];
      networkLoadedRef.current = true;
      setMovies(data);
      setInitialLoad(false);
      void writeLibraryCache(data);
    } catch (err) {
      console.error("[movies-organizer] fetchMovies: error", err);
    }
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      searchRunnerRef.current.invalidate();
      setSearchMovies(null);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    let searchError: unknown = null;
    // Keep showing the previous results while the new query is in flight;
    // blanking the list here made the whole view flash empty on every keystroke.
    setSearching(true);
    const timeoutId = window.setTimeout(async () => {
      await searchRunnerRef.current.run(
        async () => {
          try {
            return await fetchLibrarySearchMovies(query, controller.signal);
          } catch (error) {
            searchError = error;
            throw error;
          }
        },
        {
          onSuccess: (results) => {
            setSearchMovies(results);
            setSearching(false);
          },
          onError: () => {
            if (controller.signal.aborted) return;
            setSearchMovies([]);
            setSearching(false);
            console.error("[movies-organizer] searchMovies: error", searchError);
          },
        },
      );
    }, 200);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
      searchRunnerRef.current.invalidate();
    };
  }, [searchQuery]);

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
        setSearchMovies((prev) =>
          prev?.map((movie) =>
            movie.id === id ? { ...movie, ...updates } : movie,
          ) ?? null,
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
        setSearchMovies((prev) =>
          prev?.map((movie) => (movie.id === id ? updatedMovie : movie)) ??
          null,
        );
        return updatedMovie;
      } catch (error) {
        if (previousMovie) {
          setMovies((prev) =>
            prev.map((movie) => (movie.id === id ? previousMovie : movie)),
          );
          setSearchMovies((prev) =>
            prev?.map((movie) => (movie.id === id ? previousMovie : movie)) ??
            null,
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
    const removedIndex = movies.findIndex((m) => m.id === id);
    const removed = removedIndex >= 0 ? movies[removedIndex] : undefined;
    // Optimistic: hide the card at once, but put it back if the server refused
    // (a 429 from the mutation rate limit used to leave a card that vanished
    // from the screen and came back on the next reload).
    setMovies((prev) => prev.filter((m) => m.id !== id));
    setSearchMovies((prev) => prev?.filter((m) => m.id !== id) ?? null);
    void requestMovieDelete(id, title).then((result) => {
      if (result.ok) {
        addToast(`Removed "${title}"`);
        return;
      }
      if (removed) {
        setMovies((prev) => restoreMovieAt(prev, removed, removedIndex));
        setSearchMovies((prev) =>
          prev ? restoreMovieAt(prev, removed, removedIndex) : prev,
        );
      }
      addToast(result.message);
    });
  }

  function handleMoveToWatchlist(id: number, title: string) {
    setMovies((prev) =>
      prev.map((m) => (m.id === id ? { ...m, wishlist: 1 } : m)),
    );
    setSearchMovies((prev) =>
      prev?.map((m) => (m.id === id ? { ...m, wishlist: 1 } : m)) ?? null,
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
    setSearchMovies((prev) =>
      prev?.map((m) => (m.id === movie.id ? nextMovie : m)) ?? null,
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
    searching,
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
