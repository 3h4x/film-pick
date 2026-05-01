"use client";
import MovieCard from "@/components/MovieCard";
import SortFilterBar from "@/components/SortFilterBar";
import type { Movie } from "@/lib/types";
import { PAGE_SIZE } from "@/lib/types";
import type { useLibrary } from "@/lib/hooks/useLibrary";

type LibraryState = ReturnType<typeof useLibrary>;

interface LibraryViewProps {
  library: LibraryState;
  onMovieClick: (movie: Movie) => void;
  onImport: () => void;
  onOpenSearch: () => void;
  onSearchInTMDb: (query: string) => void;
}

export default function LibraryView({
  library,
  onMovieClick,
  onImport,
  onOpenSearch,
  onSearchInTMDb,
}: LibraryViewProps) {
  const {
    movies,
    initialLoad,
    sort,
    sortDir,
    genreFilter,
    sourceFilter,
    yearFilter,
    unratedOnly,
    hasFileOnly,
    searchQuery,
    setSearchQuery,
    genres,
    sources,
    years,
    sortedMovies,
    visibleMovies,
    visibleCount,
    setVisibleCount,
    setSortOption,
    toggleSortDir,
    setGenreFilter,
    setSourceFilter,
    setYearFilter,
    setUnratedOnly,
    setHasFileOnly,
    handleDeleteMovie,
    handleMoveToWatchlist,
  } = library;

  if (initialLoad) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-10 w-full max-w-xs bg-gray-800/40 rounded-xl" />
        <div className="flex gap-3">
          <div className="h-9 w-full max-w-sm bg-gray-800/30 rounded-xl" />
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
    );
  }

  if (movies.length === 0) {
    return (
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
            onClick={onImport}
            className="bg-indigo-500 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-400 transition-all shadow-lg shadow-indigo-500/20 font-medium text-sm"
          >
            Import Folder
          </button>
          <button
            onClick={onOpenSearch}
            className="text-gray-400 hover:text-white px-5 py-2.5 rounded-xl hover:bg-gray-800/60 transition-all font-medium text-sm border border-gray-700/50"
          >
            Search Manually
          </button>
        </div>
      </div>
    );
  }

  if (sortedMovies.length === 0 && searchQuery) {
    return (
      <div className="text-center py-24">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-800/50 flex items-center justify-center">
          <span className="text-4xl">🔍</span>
        </div>
        <p className="text-gray-400 text-lg font-medium">
          No results for &ldquo;{searchQuery}&rdquo;
        </p>
        <p className="text-gray-600 text-sm mt-2">
          Try searching for it on TMDb to add it to your library or watchlist
        </p>
        <button
          onClick={() => onSearchInTMDb(searchQuery)}
          className="mt-6 bg-indigo-500 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-400 transition-all shadow-lg shadow-indigo-500/20 font-medium text-sm"
        >
          Search in TMDb
        </button>
      </div>
    );
  }

  return (
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
        hasFileOnly={hasFileOnly}
        searchQuery={searchQuery}
        onSortChange={setSortOption}
        onSortDirChange={toggleSortDir}
        onGenreChange={setGenreFilter}
        onSourceChange={setSourceFilter}
        onYearChange={setYearFilter}
        onUnratedChange={setUnratedOnly}
        onHasFileChange={setHasFileOnly}
        onSearchChange={setSearchQuery}
      />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <p className="text-gray-600 text-xs">
          Showing {Math.min(visibleCount, sortedMovies.length)} of{" "}
          {sortedMovies.length}
          {sortedMovies.length !== movies.length && ` (${movies.length} total)`}
        </p>
        {searchQuery && (
          <button
            onClick={() => onSearchInTMDb(searchQuery)}
            className="text-indigo-400 hover:text-indigo-300 text-xs font-medium transition-colors flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-indigo-500/10"
          >
            <span>🔍</span>
            Search &ldquo;{searchQuery}&rdquo; in TMDb
          </button>
        )}
      </div>
      {sortedMovies.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No movies match your filters</p>
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
              cdaUrl={m.cda_url}
              onAddToWatchlist={
                (!m.user_rating || m.user_rating === 0) && m.wishlist !== 1
                  ? () => handleMoveToWatchlist(m.id, m.title)
                  : undefined
              }
              onDelete={() => handleDeleteMovie(m.id, m.title)}
              onClick={() => onMovieClick(m)}
            />
          ))}
        </div>
      )}
      {visibleCount < sortedMovies.length && (
        <div className="text-center mt-8">
          <button
            onClick={() => setVisibleCount(visibleCount + PAGE_SIZE)}
            className="text-gray-400 hover:text-white px-6 py-3 rounded-xl hover:bg-gray-800/60 transition-all font-medium text-sm border border-gray-700/50"
          >
            Load More ({sortedMovies.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </>
  );
}
