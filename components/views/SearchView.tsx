"use client";
import MovieCard from "@/components/MovieCard";
import type { Movie } from "@/lib/types";
import type { TmdbSearchResult } from "@/lib/tmdb";

interface SearchViewProps {
  searchQuery: string;
  movies: Movie[];
  tmdbResults: TmdbSearchResult[];
  tmdbLoading: boolean;
  tmdbAdded: Set<number>;
  tmdbError: string | null;
  onMovieClick: (movie: Movie) => void;
  onClear: () => void;
  onGoToConfig: () => void;
  onAddToLibrary: (r: TmdbSearchResult) => Promise<void>;
  onAddToWatchlist: (r: TmdbSearchResult) => Promise<void>;
}

export default function SearchView({
  searchQuery,
  movies,
  tmdbResults,
  tmdbLoading,
  tmdbAdded,
  tmdbError,
  onMovieClick,
  onClear,
  onGoToConfig,
  onAddToLibrary,
  onAddToWatchlist,
}: SearchViewProps) {
  const q = searchQuery.toLowerCase();
  const libraryMatches = movies
    .filter(
      (m) =>
        (m.source !== "recommendation" ||
          (m.user_rating != null && (m.user_rating as number) > 0)) &&
        !m.wishlist,
    )
    .filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.pl_title?.toLowerCase().includes(q),
    );
  const wishlistMatches = movies
    .filter((m) => m.wishlist === 1)
    .filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.pl_title?.toLowerCase().includes(q),
    );
  const tmdbOnly = tmdbResults.filter(
    (r) => !movies.some((m) => m.tmdb_id === r.tmdb_id),
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <p className="text-gray-500 text-sm">
          TMDb results for{" "}
          <span className="text-white">&ldquo;{searchQuery}&rdquo;</span>
        </p>
        <button
          onClick={onClear}
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
          <p className="text-gray-400 text-lg font-medium">
            TMDb API key not configured
          </p>
          <p className="text-gray-600 text-sm mt-2">
            Add your key in the Config tab to enable search
          </p>
          <button
            onClick={onGoToConfig}
            className="mt-5 px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 transition-colors"
          >
            Go to Config
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {libraryMatches.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
                In your library
              </p>
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
                    onClick={() => onMovieClick(m)}
                  />
                ))}
              </div>
            </div>
          )}

          {wishlistMatches.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
                In your watchlist
              </p>
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
                    onClick={() => onMovieClick(m)}
                  />
                ))}
              </div>
            </div>
          )}

          {tmdbOnly.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
                From TMDb
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                {tmdbOnly.map((r) => {
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
                        <div className="absolute top-1.5 left-1.5 bg-green-600/90 text-white text-xs px-1.5 py-0.5 rounded font-medium">
                          Added
                        </div>
                      ) : (
                        <div className="absolute bottom-14 right-1 flex flex-col gap-1 opacity-0 group-hover/card:opacity-100 transition-all duration-200">
                          <button
                            onClick={() => onAddToLibrary(r)}
                            className="bg-indigo-600/90 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-sm flex items-center justify-center hover:bg-indigo-500 transition-colors"
                            title="Add to library"
                          >
                            +
                          </button>
                          <button
                            onClick={() => onAddToWatchlist(r)}
                            className="bg-blue-600/90 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-sm flex items-center justify-center hover:bg-blue-500 transition-colors"
                            title="Add to watchlist"
                          >
                            🔖
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : libraryMatches.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400 text-lg font-medium">
                No results for &ldquo;{searchQuery}&rdquo;
              </p>
              <p className="text-gray-600 text-sm mt-2">
                Try a different title or check spelling
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
