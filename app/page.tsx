"use client";

import { useState, useEffect, useRef } from "react";
import MovieDetail from "@/components/MovieDetail";
import SearchModal from "@/components/SearchModal";
import ImportModal from "@/components/ImportModal";
import SyncModal from "@/components/SyncModal";
import TvTab from "@/components/TvTab";
import PersonView from "@/components/PersonView";
import { ToastContainer } from "@/components/Toast";
import AppNav from "@/components/AppNav";
import LibraryView from "@/components/views/LibraryView";
import RecommendationsView from "@/components/views/RecommendationsView";
import SearchView from "@/components/views/SearchView";
import WishlistView from "@/components/views/WishlistView";
import ConfigView from "@/components/views/ConfigView";
import { useLibrary } from "@/lib/hooks/useLibrary";
import { useRecommendations } from "@/lib/hooks/useRecommendations";
import { useSearch } from "@/lib/hooks/useSearch";
import { useSettings } from "@/lib/hooks/useSettings";
import type { AppTab, ToastItem, Movie, RecConfig } from "@/lib/types";
import { MOOD_PRESETS, type MoodKey } from "@/lib/mood-presets";

function parseHash(): { tab: AppTab; category: string; moodKey?: MoodKey } {
  if (typeof window === "undefined")
    return { tab: "recommendations", category: "all" };
  const hash = window.location.hash.replace("#", "");
  if (hash === "wishlist") return { tab: "wishlist", category: "all" };
  if (hash === "config") return { tab: "config", category: "all" };
  if (hash === "tv") return { tab: "tv", category: "all" };
  if (hash.startsWith("search/"))
    return { tab: "search", category: decodeURIComponent(hash.substring(7)) };
  if (hash.startsWith("recommendations")) {
    const parts = hash.split("/");
    if (parts[1] === "mood" && parts[2] && parts[2] in MOOD_PRESETS)
      return { tab: "recommendations", category: "all", moodKey: parts[2] as MoodKey };
    if (parts[1] === "mood") return { tab: "recommendations", category: "all" };
    return { tab: "recommendations", category: parts[1] || "all" };
  }
  if (hash.startsWith("person/"))
    return { tab: "person", category: decodeURIComponent(hash.substring(7)) };
  return { tab: "recommendations", category: "all" };
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<AppTab>("recommendations");
  const [personFilter, setPersonFilter] = useState("");
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [disabledEngines, setDisabledEngines] = useState<string[]>([]);
  const [recConfig, setRecConfig] = useState<RecConfig>({
    excluded_genres: [], min_year: null, min_rating: null, max_per_group: 15,
    movie_seed_min_rating: 7, movie_seed_count: 10, use_tmdb_similar: true,
    actor_min_appearances: 2, director_min_films: 2,
  });

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);
  const pendingMovieRef = useRef<string | null>(null);
  function addToast(message: string, variant?: "default" | "success") {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
  }

  const library = useLibrary(addToast);
  const { movies, setMovies, fetchMovies, initialLoad, searchQuery, setSearchQuery, wishlistMovies } = library;

  const recs = useRecommendations({ movies, disabledEngines, activeTab, addToast, setMovies, setSelectedMovie });

  const settings = useSettings({
    onGroupOrderLoaded: recs.setGroupOrder,
    onConfigLoaded: setRecConfig,
    setDisabledEngines,
  });

  const search = useSearch({ movies, setMovies, selectedMovie, setSelectedMovie, addToast, setSearchOpen });

  useEffect(() => {
    fetchMovies();
    settings.fetchSettings();
    (async () => {
      try {
        const r = await fetch("/api/recommendations/count");
        const d = await r.json();
        recs.setTotalRecsCount(d.total);
      } catch {}
    })();
  }, [fetchMovies, settings.fetchSettings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore tab from URL hash on mount (or queue a movie to open once library loads)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#movie/")) {
      pendingMovieRef.current = hash.substring(7);
      return;
    }
    const { tab, category, moodKey } = parseHash();
    if (tab === "search") return;
    if (tab !== "recommendations") setActiveTab(tab);
    if (tab === "person") setPersonFilter(category);
    else if (tab === "recommendations") {
      if (moodKey) recs.setActiveMood(moodKey);
      else if (category !== "all") recs.setRecCategory(category);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // After movies load, open movie referenced in URL (e.g. shared link)
  useEffect(() => {
    if (!pendingMovieRef.current || initialLoad) return;
    const ref = pendingMovieRef.current;
    pendingMovieRef.current = null;
    let found: Movie | undefined;
    if (ref.startsWith("local/")) {
      const id = parseInt(ref.substring(6), 10);
      found = movies.find((m) => m.id === id);
    } else {
      const tmdbId = parseInt(ref, 10);
      if (!isNaN(tmdbId)) found = movies.find((m) => m.tmdb_id === tmdbId);
    }
    if (found) setSelectedMovie(found);
  }, [movies, initialLoad]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync URL hash with state (movie modal takes precedence over tab hash)
  useEffect(() => {
    let hash: string;
    if (selectedMovie) {
      hash = selectedMovie.tmdb_id
        ? `#movie/${selectedMovie.tmdb_id}`
        : `#movie/local/${selectedMovie.id}`;
    } else {
      hash =
        activeTab === "person" ? `#person/${encodeURIComponent(personFilter)}`
        : activeTab === "search" ? `#search/${encodeURIComponent(searchQuery)}`
        : activeTab === "library" ? "#library"
        : activeTab === "wishlist" ? "#wishlist"
        : activeTab === "config" ? "#config"
        : activeTab === "tv" ? "#tv"
        : recs.activeMood ? `#recommendations/mood/${recs.activeMood}`
        : recs.recCategory === "all" ? "#recommendations"
        : `#recommendations/${recs.recCategory}`;
    }
    if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
  }, [selectedMovie, activeTab, recs.recCategory, recs.activeMood, personFilter, searchQuery]);

  // Browser back/forward / external hash navigation
  useEffect(() => {
    function onHashChange() {
      const hash = window.location.hash;
      if (hash.startsWith("#movie/")) {
        const ref = hash.substring(7);
        let found: Movie | undefined;
        if (ref.startsWith("local/")) {
          const id = parseInt(ref.substring(6), 10);
          found = movies.find((m) => m.id === id);
        } else {
          const tmdbId = parseInt(ref, 10);
          if (!isNaN(tmdbId)) found = movies.find((m) => m.tmdb_id === tmdbId);
        }
        if (found) setSelectedMovie(found);
        return;
      }
      setSelectedMovie(null);
      const { tab, category, moodKey } = parseHash();
      setActiveTab(tab);
      if (tab === "person") setPersonFilter(category);
      else { recs.setActiveMood(moodKey ?? null); recs.setRecCategory(category); }
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [movies]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === "search" && !searchQuery.trim()) setActiveTab("library");
  }, [searchQuery, activeTab]);

  return (
    <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 flex-1">
      <AppNav
        activeTab={activeTab} setActiveTab={setActiveTab} initialLoad={initialLoad}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        moviesCount={movies.length} wishlistCount={wishlistMovies.length}
        totalRecsCount={recs.totalRecsCount} categoryCounts={recs.categoryCounts}
        epgEnabled={settings.epgEnabled} libraryPath={settings.libraryPath}
        onSync={() => setSyncOpen(true)} onImport={() => setImportOpen(true)}
        onSearchEnter={search.handleNavSearch}
      />

      <div className="mt-6 w-full">
        {activeTab === "search" && (
          <SearchView searchQuery={searchQuery} movies={movies}
            tmdbResults={search.tmdbResults} tmdbLoading={search.tmdbLoading}
            tmdbAdded={search.tmdbAdded} tmdbError={search.tmdbError}
            onMovieClick={setSelectedMovie}
            onClear={() => { setSearchQuery(""); setActiveTab("library"); }}
            onGoToConfig={() => { setSearchQuery(""); setActiveTab("config"); }}
            onAddToLibrary={async (r) => { await search.handleAddMovie(r, false); search.setTmdbAdded((prev) => new Set(prev).add(r.tmdb_id)); }}
            onAddToWatchlist={async (r) => { await search.handleAddMovie(r, true); search.setTmdbAdded((prev) => new Set(prev).add(r.tmdb_id)); }}
          />
        )}
        {activeTab === "library" && (
          <LibraryView library={library} onMovieClick={setSelectedMovie} onImport={() => setImportOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
            onSearchInTMDb={(q) => { setActiveTab("search"); search.handleNavSearch(q); }}
          />
        )}
        {activeTab === "recommendations" && (
          <RecommendationsView recs={recs} hasMovies={movies.length > 0} disabledEngines={disabledEngines} />
        )}
        {activeTab === "person" && personFilter && (
          <PersonView name={personFilter} movies={movies} onBack={() => setActiveTab("library")} onClickMovie={setSelectedMovie} />
        )}
        {activeTab === "wishlist" && (
          <WishlistView wishlistMovies={wishlistMovies} onMovieClick={setSelectedMovie} onAction={library.handleWishlistAction} />
        )}
        {activeTab === "tv" && <TvTab />}
        {activeTab === "config" && (
          <ConfigView recConfig={recConfig} setRecConfig={setRecConfig}
            tmdbKeySource={settings.tmdbKeySource} disabledEngines={disabledEngines}
            setDisabledEngines={setDisabledEngines} libraryPath={settings.libraryPath}
            setLibraryPath={settings.setLibraryPath} setSyncOpen={setSyncOpen}
            addToast={addToast} fetchEngine={recs.fetchEngine} setRecGroups={recs.setRecGroups}
          />
        )}
      </div>

      <SearchModal isOpen={searchOpen}
        onClose={() => { setSearchOpen(false); search.setSearchTargetId(null); }}
        onAdd={search.handleAddMovie} initialQuery={searchQuery} targetMovieId={search.searchTargetId} />
      <ImportModal isOpen={importOpen} onClose={() => setImportOpen(false)}
        onComplete={() => { fetchMovies(); settings.fetchSettings(); addToast("Import complete"); }}
        currentPath={settings.libraryPath} />
      <SyncModal isOpen={syncOpen} onClose={() => setSyncOpen(false)} onComplete={fetchMovies} />

      {selectedMovie && (
        <MovieDetail movie={selectedMovie} onClose={() => setSelectedMovie(null)}
          onUpdate={(updated) => { setMovies((prev) => prev.map((m) => (m.id === updated.id ? updated : m))); setSelectedMovie(updated); }}
          allMovies={movies}
          onPersonClick={(name) => { setSelectedMovie(null); setPersonFilter(name); setActiveTab("person"); }}
          onSearchTMDb={(query, targetId) => { setSearchQuery(query); search.setSearchTargetId(targetId || null); setSearchOpen(true); }}
          onMerge={async (sourceId, targetId) => {
            if (targetId === -1) { setMovies((prev) => prev.filter((m) => m.id !== sourceId)); setSelectedMovie(null); return; }
            const res = await fetch(`/api/movies/${targetId}`);
            const data = await res.json();
            if (data.movie) {
              setMovies((prev) => prev.filter((m) => m.id !== sourceId).map((m) => (m.id === targetId ? data.movie : m)));
              setSelectedMovie(data.movie); addToast("Movies merged successfully");
            } else { setMovies((prev) => prev.filter((m) => m.id !== sourceId)); setSelectedMovie(null); fetchMovies(); }
          }}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </main>
  );
}
