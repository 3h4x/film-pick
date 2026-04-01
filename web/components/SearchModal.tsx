"use client";

import { useState } from "react";
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
  onAdd: (movie: SearchResult) => void;
}

export default function SearchModal({ isOpen, onClose, onAdd }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setResults(data);
    setLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center z-50 pt-[10vh] animate-[fadeIn_150ms_ease-out]">
      <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 w-full max-w-2xl max-h-[75vh] overflow-y-auto shadow-2xl shadow-black/50">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-white text-lg font-semibold">Add to Library</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors w-8 h-8 rounded-lg hover:bg-gray-800 flex items-center justify-center"
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
            onClick={handleSearch}
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
              <div
                key={r.tmdb_id}
                className="cursor-pointer"
                onClick={() => onAdd(r)}
              >
                <MovieCard
                  title={r.title}
                  year={r.year}
                  genre={r.genre}
                  rating={r.rating}
                  userRating={null}
                  posterUrl={r.poster_url}
                  source="tmdb"
                />
              </div>
            ))}
          </div>
        )}

        {results.length === 0 && !loading && query && (
          <div className="text-center py-12">
            <p className="text-gray-500">No results for &ldquo;{query}&rdquo;</p>
          </div>
        )}

        {!query && !loading && results.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600 text-sm">Type a movie name and press Enter</p>
          </div>
        )}
      </div>
    </div>
  );
}
