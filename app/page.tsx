"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import MovieCard from "@/components/MovieCard";
import MovieDetail from "@/components/MovieDetail";
import SearchModal from "@/components/SearchModal";
import { cleanTitle } from "@/lib/utils";
import ImportModal from "@/components/ImportModal";
import SyncModal from "@/components/SyncModal";
import RecommendationRow from "@/components/RecommendationRow";
import SortFilterBar from "@/components/SortFilterBar";
import RecommendationSkeleton from "@/components/RecommendationSkeleton";
import ConfigPanel, { type RecConfig } from "@/components/ConfigPanel";
import TvTab from "@/components/TvTab";
import PersonView from "@/components/PersonView";
import { ToastContainer } from "@/components/Toast";

type SortOption =
  | "user_rating"
  | "rating"
  | "year"
  | "title"
  | "created_at"
  | "rated_at";

interface Movie {
  id: number;
  title: string;
  year: number | null;
  genre: string | null;
  director: string | null;
  writer: string | null;
  actors: string | null;
  rating: number | null;
  user_rating: number | null;
  poster_url: string | null;
  source: string | null;
  type: string;
  tmdb_id?: number | null;
  rated_at: string | null;
  created_at: string;
  filmweb_url?: string | null;
  cda_url?: string | null;
  pl_title?: string | null;
  wishlist?: number;
  file_path?: string | null;
}

type RecType =
  | "genre"
  | "director"
  | "actor"
  | "movie"
  | "hidden_gem"
  | "star_studded"
  | "random"
  | "cda";

interface RecommendationGroup {
  reason: string;
  type: RecType;
  recommendations: any[];
}

const REC_CATEGORIES: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "random", label: "Surprise Me" },
  { value: "genre", label: "By Genre" },
  { value: "actor", label: "By Actor" },
  { value: "director", label: "By Director" },
  { value: "movie", label: "Similar" },
  { value: "hidden_gem", label: "Hidden Gems" },
  { value: "star_studded", label: "Star-Studded" },
  { value: "watchlist", label: "From Watchlist" },
  { value: "cda", label: "On CDA" },
];

interface ToastItem {
  id: number;
  message: string;
  variant?: "default" | "success";
}

const PAGE_SIZE = 36;

type AppTab = "library" | "recommendations" | "wishlist" | "config" | "person" | "search" | "tv";

function formatRefreshTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `yesterday at ${date.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString("en", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function parseHash(): { tab: AppTab; category: string } {
  if (typeof window === "undefined") return { tab: "recommendations", category: "all" };
  const hash = window.location.hash.replace("#", "");
  if (hash === "wishlist") return { tab: "wishlist", category: "all" };
  if (hash === "config") return { tab: "config", category: "all" };
  if (hash === "tv") return { tab: "tv", category: "all" };
  if (hash.startsWith("search/")) return { tab: "search", category: decodeURIComponent(hash.substring(7)) };
  if (hash.startsWith("recommendations")) {
    const parts = hash.split("/");
    return { tab: "recommendations", category: parts[1] || "all" };
  }
  if (hash.startsWith("person/")) {
    return { tab: "person", category: decodeURIComponent(hash.substring(7)) };
  }
  return { tab: "recommendations", category: "all" };
}

export default function Home() {

  const [activeTab, setActiveTab] = useState<AppTab>("recommendations");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [recGroups, setRecGroups] = useState<
    Record<string, RecommendationGroup[]>
  >({});
  const [recLoading, setRecLoading] = useState<Record<string, boolean>>({});
  const [totalRecsCount, setTotalRecsCount] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [searchTargetId, setSearchTargetId] = useState<number | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [personFilter, setPersonFilter] = useState<string>("");
  const [initialLoad, setInitialLoad] = useState(true);
  const [libraryPath, setLibraryPath] = useState<string | null>(null);
  const [tmdbKeySource, setTmdbKeySource] = useState<"env" | "db" | null>(null);
  const [disabledEngines, setDisabledEngines] = useState<string[]>([]);
  const [epgEnabled, setEpgEnabled] = useState(true);

  // Sort, filter, search
  const [sort, setSort] = useState<SortOption>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [genreFilter, setGenreFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [unratedOnly, setUnratedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset pagination on search/filter changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, sort, genreFilter, sourceFilter, yearFilter, unratedOnly]);

  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);

  // Last recs refresh timestamp
  const [lastRecsRefresh, setLastRecsRefresh] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("rec_last_refreshed") : null
  );

  // TMDb search results (inline search tab)
  const [tmdbResults, setTmdbResults] = useState<any[]>([]);
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [tmdbAdded, setTmdbAdded] = useState<Set<number>>(new Set());
  const [tmdbError, setTmdbError] = useState<string | null>(null);

  // Rec state
  const [recCategory, setRecCategory] = useState("all");
  const [recConfig, setRecConfig] = useState<RecConfig>({
    excluded_genres: [],
    min_year: null,
    min_rating: null,
    max_per_group: 15,
    movie_seed_min_rating: 7,
    movie_seed_count: 10,
    use_tmdb_similar: true,
    actor_min_appearances: 2,
    director_min_films: 2,
  });
  const [groupOrder, setGroupOrder] = useState<string[]>([]);

  // Read hash on mount (after hydration to avoid mismatch)
  useEffect(() => {
    const { tab, category } = parseHash();
    // Don't restore search tab on mount — it has no cached results
    if (tab === "search") return;
    if (tab !== "recommendations") setActiveTab(tab);
    if (tab === "person") setPersonFilter(category);
    else if (tab === "recommendations" && category !== "all") setRecCategory(category);
  }, []);

  // Sync URL hash with state
  useEffect(() => {
    const hash =
      activeTab === "person"
        ? `#person/${encodeURIComponent(personFilter)}`
        : activeTab === "search"
          ? `#search/${encodeURIComponent(searchQuery)}`
          : activeTab === "library"
            ? "#library"
            : activeTab === "wishlist"
              ? "#wishlist"
              : activeTab === "config"
                ? "#config"
                : activeTab === "tv"
                  ? "#tv"
                  : recCategory === "all"
                    ? "#recommendations"
                    : `#recommendations/${recCategory}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  }, [activeTab, recCategory, personFilter, searchQuery]);

  // Handle browser back/forward
  useEffect(() => {
    function onHashChange() {
      const { tab, category } = parseHash();
      setActiveTab(tab);
      if (tab === "person") {
        setPersonFilter(category);
      } else {
        setRecCategory(category);
      }
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const recommendations = useMemo(() => {
    // Filter out movies the user has already rated
    const ratedTmdbIds = new Set(
      movies
        .filter(
          (m) =>
            m.user_rating != null && (m.user_rating as number) > 0 && m.tmdb_id,
        )
        .map((m) => m.tmdb_id),
    );
    const filterRated = (groups: RecommendationGroup[], skipFilter: boolean = false) =>
      groups
        .map((g) => ({
          ...g,
          recommendations: skipFilter
            ? g.recommendations
            : g.recommendations.filter(
                (r: any) => !ratedTmdbIds.has(r.tmdb_id),
              ),
        }))
        .filter((g) => g.recommendations.length > 0);

    if (recCategory === "all") {
      const seen = new Set<number>();
      return filterRated(Object.values(recGroups).flat()).map((g) => ({
        ...g,
        recommendations: g.recommendations.filter((r: any) => {
          if (seen.has(r.tmdb_id)) return false;
          seen.add(r.tmdb_id);
          return true;
        }),
      })).filter((g) => g.recommendations.length > 0);
    }
    // Don't filter out already-rated movies for "random" engine
    return filterRated(recGroups[recCategory] ?? [], recCategory === "random");
  }, [recGroups, recCategory, movies]);

  const categoryCounts = useMemo(() => {
    const ratedTmdbIds = new Set(
      movies
        .filter((m) => m.user_rating != null && (m.user_rating as number) > 0 && m.tmdb_id)
        .map((m) => m.tmdb_id),
    );
    const counts: Record<string, number> = {};
    for (const [key, groups] of Object.entries(recGroups)) {
      const count = groups.reduce(
        (acc, g) => acc + g.recommendations.filter((r: any) => !ratedTmdbIds.has(r.tmdb_id)).length,
        0,
      );
      if (count > 0) counts[key] = count;
    }
    const allSeen = new Set<number>();
    for (const groups of Object.values(recGroups)) {
      for (const g of groups) {
        for (const r of g.recommendations as any[]) {
          if (!ratedTmdbIds.has(r.tmdb_id)) allSeen.add(r.tmdb_id);
        }
      }
    }
    if (allSeen.size > 0) counts["all"] = allSeen.size;
    return counts;
  }, [recGroups, movies]);

  const wishlistMovies = useMemo(
    () => movies.filter((m) => (m as any).wishlist === 1 && !m.user_rating),
    [movies],
  );

  const hasAnyRecs = Object.keys(recGroups).length > 0;
  // Only show skeleton on initial load (no content yet). During refresh, keep existing content visible.
  const recsLoading =
    recCategory === "all"
      ? !hasAnyRecs && (Object.values(recLoading).some(Boolean) || (activeTab === "recommendations" && movies.length > 0))
      : !recGroups[recCategory] && ((recLoading[recCategory] ?? false) || (activeTab === "recommendations" && movies.length > 0));

  function addToast(message: string, variant?: "default" | "success") {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
  }

  function dismissToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  // Exit search mode when query is cleared
  useEffect(() => {
    if (activeTab === "search" && !searchQuery.trim()) {
      setActiveTab("library");
    }
  }, [searchQuery, activeTab]);

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [
    sort,
    sortDir,
    genreFilter,
    sourceFilter,
    yearFilter,
    unratedOnly,
    searchQuery,
  ]);

  const genres = useMemo(() => {
    const all = new Set<string>();
    movies.forEach((m) => {
      if (m.genre) {
        m.genre.split(", ").forEach((g) => all.add(g.trim()));
      }
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
    // Exclude unrated recommendations from library view
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

    if (genreFilter) {
      filtered = filtered.filter((m) => m.genre?.includes(genreFilter));
    }

    if (sourceFilter) {
      filtered = filtered.filter((m) => m.source === sourceFilter);
    }

    if (yearFilter) {
      filtered = filtered.filter((m) => m.year?.toString() === yearFilter);
    }

    if (unratedOnly) {
      filtered = filtered.filter((m) => !m.user_rating || m.user_rating === 0);
    }

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
  }, [
    movies,
    sort,
    sortDir,
    genreFilter,
    sourceFilter,
    yearFilter,
    unratedOnly,
    searchQuery,
  ]);

  const visibleMovies = useMemo(
    () => sortedMovies.slice(0, visibleCount),
    [sortedMovies, visibleCount],
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

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setLibraryPath(data.library_path);
    setTmdbKeySource(data.tmdb_api_key_source ?? null);
    setDisabledEngines(data.disabled_engines ?? []);
    setEpgEnabled(data.epg_enabled ?? true);
    if (data.rec_group_order?.length) {
      setGroupOrder(data.rec_group_order);
    }
    if (data.rec_config) {
      setRecConfig(data.rec_config);
    }
  }, []);

  const fetchEngine = useCallback(async (engine: string, refresh = false) => {
    setRecLoading((prev) => ({ ...prev, [engine]: true }));
    const url = `/api/recommendations?engine=${engine}${refresh ? "&refresh=true" : ""}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      setRecGroups((prev) => ({ ...prev, [engine]: data }));
    } finally {
      setRecLoading((prev) => ({ ...prev, [engine]: false }));
    }
  }, []);

  const fetchRecsForCategory = useCallback(
    async (category: string, refresh = false) => {
      if (category === "all") {
        const toFetch = REC_CATEGORIES.slice(1)
          .map((c) => c.value)
          .filter((key) => !disabledEngines.includes(key) && (refresh || !recGroups[key]));
        await Promise.all(toFetch.map((key) => fetchEngine(key, refresh)));
      } else if (!disabledEngines.includes(category)) {
        await fetchEngine(category, refresh);
      }
    },
    [fetchEngine, recGroups, disabledEngines],
  );

  useEffect(() => {

    fetchMovies();
    fetchSettings();
    // Fetch total recs count (lightweight, reads from cache/DB)
    fetch("/api/recommendations/count")
      .then((r) => r.json())
      .then((d) => setTotalRecsCount(d.total))
      .catch(() => {});
  }, [fetchMovies, fetchSettings]);

  // Save refresh timestamp when all engines finish initial load
  const initialLoadSaved = useRef(false);
  useEffect(() => {
    if (initialLoadSaved.current) return;
    const enabled = REC_CATEGORIES.slice(1)
      .map((c) => c.value)
      .filter((key) => !disabledEngines.includes(key));
    const allLoaded = enabled.length > 0 && enabled.every((key) => recGroups[key] && !recLoading[key]);
    if (allLoaded) {
      initialLoadSaved.current = true;
      saveRefreshTimestamp();
    }
  }, [recGroups, recLoading, disabledEngines]);

  // Fetch recs when switching to recommendations tab or changing category
  useEffect(() => {
    if (activeTab === "recommendations" && movies.length > 0) {
      // Always ensure CDA engine is loaded (it's fast, DB-backed)
      if (!disabledEngines.includes("cda") && !recGroups["cda"] && !recLoading["cda"]) {
        fetchEngine("cda");
      }

      if (recCategory === "all") {
        const missing = REC_CATEGORIES.slice(1)
          .map((c) => c.value)
          .filter((key) => !disabledEngines.includes(key) && !recGroups[key] && !recLoading[key]);
        missing.forEach((key) => fetchEngine(key));
      } else if (!disabledEngines.includes(recCategory) && !recGroups[recCategory] && !recLoading[recCategory]) {
        fetchEngine(recCategory);
      }
    }
  }, [
    activeTab,
    recCategory,
    movies.length,
    fetchEngine,
    recGroups,
    recLoading,
    disabledEngines,
  ]);

  async function handleAddMovie(searchResult: any, isWishlist: boolean) {
    if (searchTargetId) {
      // Update existing movie instead of adding new one
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
          // If we have a conflict, let's offer to merge
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
                const mergeData = await mergeRes.json();
                addToast("Movies merged successfully");

                // Re-fetch the target movie to get latest merged metadata
                const refreshedRes = await fetch(`/api/movies/${existing.id}`);
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
            addToast(`Error updating metadata: ${error.error || "Conflict"}`);
          }
        } else {
          addToast(`Error: ${error.error || "Failed to update metadata"}`);
        }
      }

      setSearchOpen(false);
      setSearchTargetId(null);
      return;
    }

    // Check if we already have this movie (by tmdb_id or title/year)
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

  async function handleDeleteMovie(id: number, title: string) {
    setMovies((prev) => prev.filter((m) => m.id !== id));
    fetch(`/api/movies/${id}`, { method: "DELETE" });
    addToast(`Removed "${title}"`);
  }

  async function handleMoveToWatchlist(id: number, title: string) {
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

  async function handleSync() {
    setSyncOpen(true);
  }

  function handleImportComplete() {
    fetchMovies();
    fetchSettings();
    addToast("Import complete");
  }

  function saveRefreshTimestamp() {
    const now = new Date().toISOString();
    setLastRecsRefresh(now);
    localStorage.setItem("rec_last_refreshed", now);
  }

  async function refreshRecs() {
    const engineKeys = REC_CATEGORIES.slice(1)
      .map((c) => c.value)
      .filter((key) => !disabledEngines.includes(key));
    const loadingState = Object.fromEntries(engineKeys.map((k) => [k, true]));
    setRecLoading((prev) => ({ ...prev, ...loadingState }));
    await Promise.all(engineKeys.map((key) => fetchEngine(key, true)));
    saveRefreshTimestamp();
    addToast("Recommendations refreshed", "success");
  }

  function removeFromView(tmdbId: number, title?: string) {
    setRecGroups((prev) => {
      const next: Record<string, RecommendationGroup[]> = {};
      for (const [key, groups] of Object.entries(prev)) {
        next[key] = groups
          .map((g) => ({
            ...g,
            recommendations: g.recommendations.filter(
              (r: any) => r.tmdb_id !== tmdbId && (!title || r.title !== title),
            ),
          }))
          .filter((g) => g.recommendations.length > 0);
      }
      return next;
    });
  }

  async function handleRecAction(tmdbId: number, action: string, rec: any) {
    removeFromView(tmdbId, rec.title);
    setTotalRecsCount((c) => Math.max(0, c - 1));

    const actionLabels: Record<string, string> = {
      liked: `Liked "${rec.title}" — added to library`,
      watched: `Marked "${rec.title}" as watched`,
      disliked: `Disliked "${rec.title}" — added to library`,
      dismiss: `Won't show "${rec.title}" again`,
      wishlist: `Added "${rec.title}" to watchlist`,
    };
    addToast(actionLabels[action] || "Done");

    if (action !== "dismiss") {
      const userRating =
        action === "liked"
          ? 8
          : action === "disliked"
            ? 3
            : action === "wishlist"
              ? null
              : 5;
      const isWishlist = action === "wishlist";
      const newMovie: Movie = {
        id: Date.now(),
        title: rec.title,
        year: rec.year,
        genre: rec.genre,
        director: null,
        rating: rec.rating,
        user_rating: userRating,
        poster_url: rec.poster_url,
        source: (rec as any).cda_url ? "cda" : "tmdb",
        type: "movie",
        rated_at: null,
        created_at: new Date().toISOString(),
        wishlist: isWishlist ? 1 : 0,
        cda_url: (rec as any).cda_url || null,
      } as any;
      setMovies((prev) => {
        const exists = prev.some((m) => m.tmdb_id === rec.tmdb_id);
        return exists
          ? prev.map((m) =>
              m.tmdb_id === rec.tmdb_id ? { ...m, ...newMovie } : m,
            )
          : [newMovie, ...prev];
      });

      fetch("/api/movies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: rec.title,
          year: rec.year,
          genre: rec.genre,
          director: null,
          rating: rec.rating,
          poster_url: rec.poster_url,
          source: (rec as any).cda_url ? "cda" : "tmdb",
          imdb_id: null,
          tmdb_id: rec.tmdb_id,
          type: "movie",
          user_rating: userRating,
          wishlist: isWishlist ? 1 : 0,
          cda_url: (rec as any).cda_url || null,
        }),
      });
    }

    fetch("/api/recommendations/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdb_id: tmdbId }),
    });
  }

  async function handleRecClick(rec: any) {
    const existing = movies.find((m) => m.tmdb_id === rec.tmdb_id);
    if (existing) {
      setSelectedMovie(existing);
      return;
    }
    const res = await fetch("/api/movies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: rec.title,
        year: rec.year,
        genre: rec.genre,
        rating: rec.rating,
        poster_url: rec.poster_url,
        source: "recommendation",
        tmdb_id: rec.tmdb_id,
        type: "movie",
        cda_url: rec.cda_url || null,
      }),
    });
    if (!res.ok) return;
    const { id } = await res.json();
    const movieRes = await fetch(`/api/movies/${id}`);
    const { movie } = await movieRes.json();
    setMovies((prev) => {
      const exists = prev.some((m) => m.id === id);
      return exists ? prev.map((m) => (m.id === id ? movie : m)) : [movie, ...prev];
    });
    setSelectedMovie(movie);
  }

  return (
    <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 flex-1">
      {/* Top Navigation */}
      <nav className="sticky top-0 z-40 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 pb-4 bg-[#0a0e1a]/80 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-7xl mx-auto">
          {/* Row 1: Logo + Actions */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h1
                className="text-lg font-bold text-white tracking-tight flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => router.push("/")}
              >
                <img src="/icon-192.png" alt="FilmPick" className="w-7 h-7 rounded" />
                FilmPick
                <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-gray-700/50 text-gray-400">
                  {process.env.NEXT_PUBLIC_APP_VERSION || "dev"}
                </span>
              </h1>
              {!initialLoad && (
                  <div className="relative group flex-1 max-w-[200px] sm:max-w-xs transition-all">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                      <svg
                        className="w-3.5 h-3.5 text-gray-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter" && searchQuery.trim()) {
                          setActiveTab("search");
                          setTmdbResults([]);
                          setTmdbError(null);
                          setTmdbAdded(new Set());
                          const q = searchQuery.trim().toLowerCase();
                          const libraryMatches = movies.filter(
                            (m) => (m.source !== "recommendation" || (m.user_rating != null && (m.user_rating as number) > 0)) && !(m as any).wishlist
                          ).filter(
                            (m) => m.title.toLowerCase().includes(q) || m.pl_title?.toLowerCase().includes(q)
                          );
                          const wishlistMatches = movies.filter(
                            (m) => (m as any).wishlist === 1
                          ).filter(
                            (m) => m.title.toLowerCase().includes(q) || m.pl_title?.toLowerCase().includes(q)
                          );
                          if (libraryMatches.length === 0 && wishlistMatches.length === 0) {
                            setTmdbLoading(true);
                            const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
                            if (res.ok) {
                              setTmdbResults(await res.json());
                            } else {
                              const body = await res.json().catch(() => ({}));
                              setTmdbError(body.error === "no_api_key" ? "no_api_key" : "error");
                            }
                            setTmdbLoading(false);
                          }
                        }
                        if (e.key === "Escape") {
                          setSearchQuery("");
                          setActiveTab("library");
                        }
                      }}
                      placeholder="Search library..."
                      className="w-full bg-gray-800/40 text-white text-xs pl-8 pr-8 py-1.5 rounded-lg border border-gray-700/50 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 focus:outline-none placeholder-gray-600 transition-all"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => { setSearchQuery(""); if (activeTab === "search") setActiveTab("library"); }}
                        className="absolute inset-y-0 right-2 flex items-center px-1 text-gray-500 hover:text-white"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
            </div>
            {!initialLoad && (
              <div className="flex items-center gap-2">
                {activeTab === "library" && libraryPath && (
                  <button
                    onClick={() => setSyncOpen(true)}
                    className="text-gray-500 hover:text-white p-2 rounded-lg hover:bg-gray-800/60 transition-all"
                    title="Sync library"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  </button>
                )}
                {activeTab === "library" && (
                  <button
                    onClick={() => setImportOpen(true)}
                    className="text-gray-500 hover:text-white p-2 rounded-lg hover:bg-gray-800/60 transition-all"
                    title="Import folder"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Row 2: Tabs */}
          <div className="flex gap-1">
            {[
              {
                key: "recommendations" as const,
                label: "Discover",
                count: categoryCounts["all"] > 0 ? categoryCounts["all"] : totalRecsCount,
              },
              {
                key: "library" as const,
                label: "Library",
                count: initialLoad ? -1 : movies.length,
              },
              {
                key: "wishlist" as const,
                label: "Watchlist",
                count: initialLoad ? -1 : wishlistMovies.length,
              },
              ...(epgEnabled ? [{ key: "tv" as const, label: "TV", count: -1 }] : []),
              { key: "config" as const, label: "Config", count: -1 },
            ].map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative px-4 py-2 text-sm font-medium transition-all rounded-t-lg ${
                    active ? "text-white" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {tab.label}
                  {tab.count >= 0 && (
                    <span
                      className={`ml-1.5 text-[11px] tabular-nums ${
                        active ? "text-indigo-400" : "text-gray-600"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                  {active && (
                    <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-indigo-500 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="mt-6 w-full">

        {activeTab === "search" && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <p className="text-gray-500 text-sm">
                TMDb results for <span className="text-white">&ldquo;{searchQuery}&rdquo;</span>
              </p>
              <button
                onClick={() => { setSearchQuery(""); setActiveTab("library"); }}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                ✕ Clear
              </button>
            </div>
            {tmdbLoading ? (
              <div className="flex items-center justify-center py-24">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : tmdbError === "no_api_key" ? (
              <div className="text-center py-24">
                <p className="text-gray-400 text-lg font-medium">TMDb API key not configured</p>
                <p className="text-gray-600 text-sm mt-2">Add your key in the Config tab to enable search</p>
                <button
                  onClick={() => { setSearchQuery(""); setActiveTab("config"); }}
                  className="mt-5 px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 transition-colors"
                >
                  Go to Config
                </button>
              </div>
            ) : (() => {
              const q = searchQuery.toLowerCase();
              const libraryMatches = movies.filter(
                (m) => (m.source !== "recommendation" || (m.user_rating != null && (m.user_rating as number) > 0)) && !(m as any).wishlist
              ).filter(
                (m) => m.title.toLowerCase().includes(q) || m.pl_title?.toLowerCase().includes(q)
              );
              const wishlistMatches = movies.filter(
                (m) => (m as any).wishlist === 1
              ).filter(
                (m) => m.title.toLowerCase().includes(q) || m.pl_title?.toLowerCase().includes(q)
              );
              const tmdbOnly = tmdbResults.filter((r: any) => !movies.some((m) => m.tmdb_id === r.tmdb_id));
              return (
                <div className="space-y-8">
                  {/* Library matches */}
                  {libraryMatches.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">In your library</p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                        {libraryMatches.map((m) => (
                          <MovieCard
                            key={m.id}
                            title={m.title}
                            year={m.year}
                            genre={m.genre}
                            rating={m.rating}
                            userRating={m.user_rating}
                            posterUrl={m.poster_url}
                            source={m.source}
                            onClick={() => setSelectedMovie(m)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Watchlist matches */}
                  {wishlistMatches.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">In your watchlist</p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                        {wishlistMatches.map((m) => (
                          <MovieCard
                            key={m.id}
                            title={m.title}
                            year={m.year}
                            genre={m.genre}
                            rating={m.rating}
                            userRating={m.user_rating}
                            posterUrl={m.poster_url}
                            source={m.source}
                            onClick={() => setSelectedMovie(m)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TMDb results */}
                  {tmdbLoading ? (
                    <div className="flex items-center gap-2 text-gray-600 text-sm">
                      <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      Searching TMDb...
                    </div>
                  ) : tmdbError === "no_api_key" ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">TMDb</p>
                      <p className="text-gray-600 text-sm">
                        API key not configured —{" "}
                        <button onClick={() => { setSearchQuery(""); setActiveTab("config"); }} className="text-indigo-400 hover:text-indigo-300 transition-colors">
                          set it in Config
                        </button>
                      </p>
                    </div>
                  ) : tmdbOnly.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">From TMDb</p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                        {tmdbOnly.map((r: any) => {
                          const justAdded = tmdbAdded.has(r.tmdb_id);
                          return (
                            <div key={r.tmdb_id} className="relative group/card">
                              <MovieCard
                                title={r.title}
                                year={r.year}
                                genre={r.genre}
                                rating={r.rating}
                                userRating={null}
                                posterUrl={r.poster_url}
                                source="tmdb"
                                onClick={() => {}}
                              />
                              {justAdded ? (
                                <div className="absolute top-1.5 left-1.5 bg-green-600/90 text-white text-xs px-1.5 py-0.5 rounded font-medium">Added</div>
                              ) : (
                                <div className="absolute bottom-14 right-1 flex flex-col gap-1 opacity-0 group-hover/card:opacity-100 transition-all duration-200">
                                  <button
                                    onClick={async () => {
                                      await fetch("/api/movies", { method: "POST", headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ title: r.title, year: r.year, genre: r.genre, rating: r.rating, poster_url: r.poster_url, source: "tmdb", imdb_id: r.imdb_id, tmdb_id: r.tmdb_id, type: "movie" }),
                                      });
                                      setTmdbAdded((prev) => new Set(prev).add(r.tmdb_id));
                                      fetchMovies();
                                    }}
                                    className="bg-indigo-600/90 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-sm flex items-center justify-center hover:bg-indigo-500 transition-colors"
                                    title="Add to library"
                                  >+</button>
                                  <button
                                    onClick={async () => {
                                      await fetch("/api/movies", { method: "POST", headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ title: r.title, year: r.year, genre: r.genre, rating: r.rating, poster_url: r.poster_url, source: "tmdb", imdb_id: r.imdb_id, tmdb_id: r.tmdb_id, type: "movie", wishlist: 1 }),
                                      });
                                      setTmdbAdded((prev) => new Set(prev).add(r.tmdb_id));
                                      fetchMovies();
                                    }}
                                    className="bg-blue-600/90 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-sm flex items-center justify-center hover:bg-blue-500 transition-colors"
                                    title="Add to watchlist"
                                  >🔖</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : libraryMatches.length === 0 ? (
                    <div className="text-center py-16">
                      <p className="text-gray-400 text-lg font-medium">No results for &ldquo;{searchQuery}&rdquo;</p>
                      <p className="text-gray-600 text-sm mt-2">Try a different title or check spelling</p>
                    </div>
                  ) : null}
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === "library" && (
          <>
            {initialLoad ? (
              <div className="animate-pulse space-y-6">
                <div className="h-10 w-80 bg-gray-800/40 rounded-xl" />
                <div className="flex gap-3">
                  <div className="h-9 w-96 bg-gray-800/30 rounded-xl" />
                  <div className="h-9 w-28 bg-gray-800/30 rounded-xl" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-xl overflow-hidden bg-gray-800/40 border border-gray-700/20"
                    >
                      <div className="aspect-[2/3] bg-gray-700/30" />
                      <div className="p-3 space-y-2">
                        <div className="h-4 w-24 bg-gray-700/30 rounded" />
                        <div className="h-3 w-16 bg-gray-700/20 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : movies.length === 0 ? (
              <div className="text-center py-24">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-800/50 flex items-center justify-center">
                  <span className="text-4xl">🎬</span>
                </div>
                <p className="text-gray-400 text-lg font-medium">
                  Your library is empty
                </p>
                <p className="text-gray-600 text-sm mt-2">
                  Import a folder or search to start building your collection
                </p>
                <div className="flex items-center justify-center gap-3 mt-6">
                  <button
                    onClick={() => setImportOpen(true)}
                    className="bg-indigo-500 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-400 transition-all shadow-lg shadow-indigo-500/20 font-medium text-sm"
                  >
                    Import Folder
                  </button>
                  <button
                    onClick={() => router.push("/search")}
                    className="text-gray-400 hover:text-white px-5 py-2.5 rounded-xl hover:bg-gray-800/60 transition-all font-medium text-sm border border-gray-700/50"
                  >
                    Search Manually
                  </button>
                </div>
              </div>
            ) : sortedMovies.length === 0 && searchQuery ? (
              <div className="text-center py-24">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-800/50 flex items-center justify-center">
                  <span className="text-4xl">🔍</span>
                </div>
                <p className="text-gray-400 text-lg font-medium">
                  No results for &ldquo;{searchQuery}&rdquo;
                </p>
                <p className="text-gray-600 text-sm mt-2">
                  Try searching for it on TMDb to add it to your library or
                  watchlist
                </p>
                <button
                  onClick={() => router.push(`/search/${encodeURIComponent(searchQuery)}`)}
                  className="mt-6 bg-indigo-500 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-400 transition-all shadow-lg shadow-indigo-500/20 font-medium text-sm"
                >
                  Search in TMDb
                </button>
              </div>
            ) : (
              <>
                <SortFilterBar
                  sort={sort}
                  sortDir={sortDir}
                  genre={genreFilter}
                  genres={genres}
                  source={sourceFilter}
                  sources={sources}
                  year={yearFilter}
                  years={years}
                  unratedOnly={unratedOnly}
                  searchQuery={searchQuery}
                  onSortChange={setSort}
                  onSortDirChange={() =>
                    setSortDir((d) => (d === "desc" ? "asc" : "desc"))
                  }
                  onGenreChange={setGenreFilter}
                  onSourceChange={setSourceFilter}
                  onYearChange={setYearFilter}
                  onUnratedChange={setUnratedOnly}
                  onSearchChange={setSearchQuery}
                />
                <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
                  <p className="text-gray-600 text-xs">
                    Showing {Math.min(visibleCount, sortedMovies.length)} of{" "}
                    {sortedMovies.length}
                    {sortedMovies.length !== movies.length &&
                      ` (${movies.length} total)`}
                  </p>
                  {searchQuery && (
                    <button
                      onClick={() => router.push(`/search/${encodeURIComponent(searchQuery)}`)}
                      className="text-indigo-400 hover:text-indigo-300 text-xs font-medium transition-colors flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-indigo-500/10"
                    >
                      <span>🔍</span>
                      Search &ldquo;{searchQuery}&rdquo; in TMDb
                    </button>
                  )}
                </div>
                {sortedMovies.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-500">
                      No movies match your filters
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                    {visibleMovies.map((m) => (
                      <MovieCard
                        key={m.id}
                        title={m.title}
                        year={m.year}
                        genre={m.genre}
                        rating={m.rating}
                        userRating={m.user_rating}
                        posterUrl={m.poster_url}
                        source={m.source}
                        onAddToWatchlist={
                          (!m.user_rating || m.user_rating === 0) &&
                          m.wishlist !== 1
                            ? () => handleMoveToWatchlist(m.id, m.title)
                            : undefined
                        }
                        onDelete={() => handleDeleteMovie(m.id, m.title)}
                        onClick={() => setSelectedMovie(m)}
                      />
                    ))}
                  </div>
                )}
                {visibleCount < sortedMovies.length && (
                  <div className="text-center mt-8">
                    <button
                      onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                      className="text-gray-400 hover:text-white px-6 py-3 rounded-xl hover:bg-gray-800/60 transition-all font-medium text-sm border border-gray-700/50"
                    >
                      Load More ({sortedMovies.length - visibleCount} remaining)
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {activeTab === "recommendations" && (
          <>
            {movies.length === 0 ? (
              <div className="text-center py-24">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-800/50 flex items-center justify-center">
                  <span className="text-4xl">💡</span>
                </div>
                <p className="text-gray-400 text-lg font-medium">
                  No recommendations yet
                </p>
                <p className="text-gray-600 text-sm mt-2">
                  Add some movies to your library first
                </p>
              </div>
            ) : (
              <>
                {/* Category tabs + CDA toggle */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex gap-1 overflow-x-auto bg-gray-800/40 p-1 rounded-xl">
                    {REC_CATEGORIES.filter((cat) => cat.value === "all" || !disabledEngines.includes(cat.value)).map((cat) => (
                      <button
                        key={cat.value}
                        onClick={() => setRecCategory(cat.value)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${
                          recCategory === cat.value
                            ? "bg-gray-700/80 text-white shadow-sm"
                            : "text-gray-500 hover:text-gray-300 hover:bg-gray-700/30"
                        }`}
                      >
                        {cat.label}
                        {categoryCounts[cat.value] != null && (
                          <span className={`text-xs tabular-nums ${recCategory === cat.value ? "text-gray-400" : "text-gray-600"}`}>
                            {categoryCounts[cat.value]}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {lastRecsRefresh && (
                      <span className="text-gray-600 text-xs hidden sm:inline">
                        refreshed {formatRefreshTime(lastRecsRefresh)}
                      </span>
                    )}
                    <button
                      onClick={refreshRecs}
                      className="text-gray-500 hover:text-white p-1.5 rounded-lg hover:bg-gray-800/60 transition-all"
                      title="Refresh recommendations"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>
                {recsLoading ? (
                  <RecommendationSkeleton />
                ) : recommendations.length === 0 ? (
                  <div className="text-center py-24">
                    <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-800/50 flex items-center justify-center">
                      <span className="text-4xl">🔍</span>
                    </div>
                    <p className="text-gray-400 text-lg font-medium">
                      No recommendations found
                    </p>
                    <p className="text-gray-600 text-sm mt-2">
                      Try adding more movies to improve suggestions
                    </p>
                  </div>
                ) : (
                  <>{recCategory === "all" ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {recommendations.flatMap((g) => g.recommendations).map((r: any) => (
                        <div key={r.tmdb_id} className="relative group/rec">
                          <MovieCard
                            title={r.title}
                            year={r.year}
                            genre={r.genre}
                            rating={r.rating}
                            userRating={null}
                            posterUrl={r.poster_url}
                            source="tmdb"
                            cdaUrl={r.cda_url}
                            onClick={() => handleRecClick(r)}
                          />
                          <div className="absolute bottom-14 right-1 flex flex-col gap-1 opacity-0 group-hover/rec:opacity-100 transition-all duration-200">
                            <button onClick={() => handleRecAction(r.tmdb_id, "liked", r)} className="bg-green-600/90 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-sm flex items-center justify-center hover:bg-green-500 transition-colors" title="Watched &amp; liked">👍</button>
                            <button onClick={() => handleRecAction(r.tmdb_id, "watched", r)} className="bg-gray-600/90 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-sm flex items-center justify-center hover:bg-gray-500 transition-colors" title="Watched">👁</button>
                            <button onClick={() => handleRecAction(r.tmdb_id, "wishlist", r)} className="bg-blue-600/90 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-sm flex items-center justify-center hover:bg-blue-500 transition-colors" title="Add to watchlist">🔖</button>
                            <button onClick={() => handleRecAction(r.tmdb_id, "disliked", r)} className="bg-orange-600/90 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-sm flex items-center justify-center hover:bg-orange-500 transition-colors" title="Watched &amp; disliked">👎</button>
                            <button onClick={() => handleRecAction(r.tmdb_id, "dismiss", r)} className="bg-red-600/90 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-sm flex items-center justify-center hover:bg-red-500 transition-colors" title="Don't show again">✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                    {(() => {
                      const filtered = recommendations.filter((g) => g.type === recCategory);
                      const sorted = [...filtered].sort((a, b) => {
                        const ai = groupOrder.indexOf(a.reason);
                        const bi = groupOrder.indexOf(b.reason);
                        if (ai === -1 && bi === -1) return 0;
                        if (ai === -1) return 1;
                        if (bi === -1) return -1;
                        return ai - bi;
                      });
                      return sorted.map((group, i) => (
                        <RecommendationRow
                          key={group.reason}
                          reason={group.reason}
                          type={group.type}
                          recommendations={group.recommendations}
                          onAction={handleRecAction}
                          isFirst={i === 0}
                          isLast={i === sorted.length - 1}
                          onMoveUp={() => {
                            const order = sorted.map((g) => g.reason);
                            const idx = order.indexOf(group.reason);
                            if (idx > 0) {
                              [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
                            }
                            setGroupOrder(order);
                            fetch("/api/settings", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ rec_group_order: order }),
                            });
                          }}
                          onMoveDown={() => {
                            const order = sorted.map((g) => g.reason);
                            const idx = order.indexOf(group.reason);
                            if (idx < order.length - 1) {
                              [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
                            }
                            setGroupOrder(order);
                            fetch("/api/settings", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ rec_group_order: order }),
                            });
                          }}
                          onClickMovie={handleRecClick}
                        />
                      ));
                    })()}
                    </div>
                  )}</>
                )}
              </>
            )}
          </>
        )}

        {activeTab === "person" && personFilter && (
          <PersonView
            name={personFilter}
            movies={movies}
            onBack={() => setActiveTab("library")}
            onClickMovie={(m) => setSelectedMovie(m)}
          />
        )}

        {activeTab === "wishlist" && (
          <>
            {wishlistMovies.length === 0 ? (
              <div className="text-center py-24">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-800/50 flex items-center justify-center">
                  <span className="text-4xl">🔖</span>
                </div>
                <p className="text-gray-400 text-lg font-medium">
                  Your watchlist is empty
                </p>
                <p className="text-gray-600 text-sm mt-2">
                  Browse recommendations and bookmark films you want to watch
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                {wishlistMovies.map((m) => (
                  <div key={m.id} className="relative group/wish">
                    <MovieCard
                      title={m.title}
                      year={m.year}
                      genre={m.genre}
                      rating={m.rating}
                      userRating={m.user_rating}
                      posterUrl={m.poster_url}
                      source={m.source}
                      onClick={() => setSelectedMovie(m)}
                    />
                    <div className="absolute bottom-14 right-1 flex flex-col gap-1 opacity-0 group-hover/wish:opacity-100 transition-all duration-200">
                      <button
                        onClick={() => handleWishlistAction(m, "liked")}
                        className="bg-green-600/90 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-sm flex items-center justify-center hover:bg-green-500 transition-colors"
                        title="Watched &amp; liked"
                      >
                        👍
                      </button>
                      <button
                        onClick={() => handleWishlistAction(m, "watched")}
                        className="bg-gray-600/90 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-sm flex items-center justify-center hover:bg-gray-500 transition-colors"
                        title="Watched"
                      >
                        👁
                      </button>
                      <button
                        onClick={() => handleWishlistAction(m, "disliked")}
                        className="bg-orange-600/90 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-sm flex items-center justify-center hover:bg-orange-500 transition-colors"
                        title="Watched &amp; disliked"
                      >
                        👎
                      </button>
                      <button
                        onClick={() => handleWishlistAction(m, "remove")}
                        className="bg-red-600/90 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-sm flex items-center justify-center hover:bg-red-500 transition-colors"
                        title="Remove from watchlist"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "tv" && <TvTab />}

        {activeTab === "config" && (
          <ConfigPanel
            config={recConfig}
            tmdbKeySource={tmdbKeySource}
            disabledEngines={disabledEngines}
            engines={REC_CATEGORIES.slice(1)}
            libraryPath={libraryPath}
            onSaveLibraryPath={async (path) => {
              const res = await fetch("/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ library_path: path }),
              });
              if (res.ok) {
                setLibraryPath(path || null);
              } else {
                const data = await res.json().catch(() => ({}));
                addToast(data.error || "Failed to save library path");
              }
            }}
            onSync={() => setSyncOpen(true)}
            onSave={async (cfg) => {
              const res = await fetch("/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rec_config: cfg }),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                addToast(data.error || "Failed to save config");
                return;
              }
              setRecConfig(cfg);
              addToast("Config saved — refreshing recommendations");
              setRecGroups({});
              REC_CATEGORIES.slice(1)
                .filter((c) => !disabledEngines.includes(c.value))
                .forEach((c) => fetchEngine(c.value, true));
            }}
            onToggleEngine={async (engineKey) => {
              const updated = disabledEngines.includes(engineKey)
                ? disabledEngines.filter((e) => e !== engineKey)
                : [...disabledEngines, engineKey];
              setDisabledEngines(updated);
              await fetch("/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ disabled_engines: updated }),
              });
              if (disabledEngines.includes(engineKey)) {
                // Re-enabled — fetch it
                fetchEngine(engineKey, true);
              } else {
                // Disabled — clear its results
                setRecGroups((prev) => {
                  const next = { ...prev };
                  delete next[engineKey];
                  return next;
                });
              }
            }}
          />
        )}
      </div>

      <SearchModal
        isOpen={searchOpen}
        onClose={() => {
          setSearchOpen(false);
          setSearchTargetId(null);
        }}
        onAdd={handleAddMovie}
        initialQuery={searchQuery}
        targetMovieId={searchTargetId}
      />

      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onComplete={handleImportComplete}
        currentPath={libraryPath}
      />

      <SyncModal
        isOpen={syncOpen}
        onClose={() => setSyncOpen(false)}
        onComplete={fetchMovies}
      />

      {selectedMovie && (
        <MovieDetail
          movie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
          onUpdate={(updated) => {
            setMovies((prev) =>
              prev.map((m) => (m.id === updated.id ? updated : m)),
            );
            setSelectedMovie(updated);
          }}
          allMovies={movies}
          onPersonClick={(name) => {
            setSelectedMovie(null);
            setPersonFilter(name);
            setActiveTab("person");
          }}
          onSearchTMDb={(query, targetId) => {
            setSearchQuery(query);
            setSearchTargetId(targetId || null);
            setSearchOpen(true);
          }}
          onMerge={async (sourceId, targetId) => {
            if (targetId === -1) {
              setMovies((prev) => prev.filter((m) => m.id !== sourceId));
              setSelectedMovie(null);
              return;
            }
            // After merge, both are likely updated in DB, but the simplest is to refresh
            // since the sourceId is now deleted and targetId has new metadata.
            const res = await fetch(`/api/movies/${targetId}`);
            const data = await res.json();
            if (data.movie) {
              setMovies((prev) =>
                prev
                  .filter((m) => m.id !== sourceId)
                  .map((m) => (m.id === targetId ? data.movie : m)),
              );
              setSelectedMovie(data.movie);
              addToast("Movies merged successfully");
            } else {
              setMovies((prev) => prev.filter((m) => m.id !== sourceId));
              setSelectedMovie(null);
              fetchMovies(); // Fallback to full refresh if target is not found
            }
          }}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}
