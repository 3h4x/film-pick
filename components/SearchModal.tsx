"use client";

import { useState, useEffect, useRef } from "react";
import MovieCard from "./MovieCard";

interface SearchResult {
  title: string;
  year: number | null;
  genre: string;
  rating: number;
  poster_url: string | null;
  tmdb_id: number;
  imdb_id: string | null;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (movie: SearchResult, isWishlist: boolean) => void;
  initialQuery?: string;
  targetMovieId?: number | null;
}

export default function SearchModal({
  isOpen,
  onClose,
  onAdd,
  initialQuery = "",
  targetMovieId = null,
}: SearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [lastInitialQuery, setLastInitialQuery] = useState(initialQuery);
  const searchExecuted = useRef(false);

  async function handleSearch(searchQuery = query) {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setHasSearched(true);
    const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
    if (!res.ok) {
      setResults([]);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setResults(data);
    setLoading(false);
  }

  // Sync initialQuery when modal opens
  if (isOpen && initialQuery !== lastInitialQuery) {
    setQuery(initialQuery);
    setLastInitialQuery(initialQuery);
    setHasSearched(false);
  }

  // Auto-search if initialQuery is provided when modal opens
  useEffect(() => {
    if (isOpen && initialQuery && !searchExecuted.current) {
      handleSearch(initialQuery);
      searchExecuted.current = true;
    }
    if (!isOpen) {
      searchExecuted.current = false;
      setHasSearched(false);
      setResults([]);
    }
  }, [isOpen, initialQuery]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") onClose();
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex items-start justify-center pt-[10vh] h-full pointer-events-none">
        <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 w-full max-w-2xl max-h-[75vh] overflow-y-auto shadow-2xl shadow-black/50 pointer-events-auto mx-4">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-white text-lg font-semibold">
            {targetMovieId ? "Relink Metadata" : "Add to Library"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors w-10 h-10 rounded-lg hover:bg-gray-800 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-2 mb-5">
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search movies..."
              className="w-full bg-gray-800/80 text-white px-4 py-2.5 rounded-xl border border-gray-700/50 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 focus:outline-none placeholder-gray-600 text-sm"
              autoFocus
            />
          </div>
          <button
            onClick={() => handleSearch()}
            disabled={loading}
            className="bg-indigo-500 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-400 disabled:opacity-50 transition-all font-medium text-sm min-w-[80px]"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
            ) : (
              "Search"
            )}
          </button>
        </div>

        {loading && results.length === 0 && (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Searching TMDb...</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {results.map((r) => (
              <div key={r.tmdb_id} className="relative group/search">
                <MovieCard
                  title={r.title}
                  year={r.year}
                  genre={r.genre}
                  rating={r.rating}
                  userRating={null}
                  posterUrl={r.poster_url}
                  source="tmdb"
                  onClick={() => onAdd(r, false)}
                />
                <div className="absolute bottom-14 right-1 flex flex-col gap-1 sm:opacity-0 sm:group-hover/search:opacity-100 transition-all duration-200">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAdd(r, false);
                    }}
                    className="bg-indigo-600/90 backdrop-blur-sm text-white rounded-lg w-9 h-9 text-sm flex items-center justify-center hover:bg-indigo-500 transition-colors"
                    title={
                      targetMovieId ? "Update existing movie" : "Add to library"
                    }
                  >
                    {targetMovieId ? "✨" : "➕"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAdd(r, true);
                    }}
                    className="bg-blue-600/90 backdrop-blur-sm text-white rounded-lg w-9 h-9 text-sm flex items-center justify-center hover:bg-blue-500 transition-colors"
                    title="Add to watchlist"
                  >
                    🔖
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {results.length === 0 && !loading && hasSearched && query && (
          <div className="text-center py-12">
            <p className="text-gray-500">
              No results for &ldquo;{query}&rdquo;
            </p>
          </div>
        )}

        {!hasSearched && !loading && results.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600 text-sm">
              Type a movie name and press Enter
            </p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
