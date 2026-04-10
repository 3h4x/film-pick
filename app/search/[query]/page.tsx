"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import MovieCard from "@/components/MovieCard";

interface SearchResult {
  title: string;
  year: number | null;
  genre: string;
  rating: number;
  poster_url: string | null;
  tmdb_id: number;
  imdb_id: string | null;
}

interface LibraryMovie {
  tmdb_id: number | null;
}

export default function SearchPage({
  params,
}: {
  params: Promise<{ query: string }>;
}) {
  const { query } = use(params);
  const decoded = decodeURIComponent(query);
  const router = useRouter();

  const [results, setResults] = useState<SearchResult[]>([]);
  const [library, setLibrary] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState<Set<number>>(new Set());

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [searchRes, libRes] = await Promise.all([
        fetch(`/api/search?q=${encodeURIComponent(decoded)}`),
        fetch("/api/movies"),
      ]);
      if (searchRes.ok) setResults(await searchRes.json());
      if (libRes.ok) {
        const movies: LibraryMovie[] = await libRes.json();
        setLibrary(new Set(movies.map((m) => m.tmdb_id).filter(Boolean) as number[]));
      }
      setLoading(false);
    }
    load();
  }, [decoded]);

  async function addMovie(result: SearchResult, wishlist: boolean) {
    await fetch("/api/movies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: result.title,
        year: result.year,
        genre: result.genre,
        rating: result.rating,
        poster_url: result.poster_url,
        source: "tmdb",
        imdb_id: result.imdb_id,
        tmdb_id: result.tmdb_id,
        type: "movie",
        wishlist: wishlist ? 1 : 0,
      }),
    });
    setAdded((prev) => new Set(prev).add(result.tmdb_id));
    setLibrary((prev) => new Set(prev).add(result.tmdb_id));
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push("/")}
            className="text-gray-500 hover:text-white transition-colors flex items-center gap-1.5 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>
          <h1 className="text-white font-semibold text-sm">
            TMDb results for &ldquo;{decoded}&rdquo;
          </h1>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-gray-400 text-lg font-medium">No results for &ldquo;{decoded}&rdquo;</p>
            <p className="text-gray-600 text-sm mt-2">Try a different title or check spelling</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {results.map((r) => {
              const inLibrary = library.has(r.tmdb_id);
              const justAdded = added.has(r.tmdb_id);
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
                  {inLibrary ? (
                    <div className="absolute top-1.5 left-1.5 bg-green-600/90 text-white text-xs px-1.5 py-0.5 rounded font-medium">
                      {justAdded ? "Added" : "In library"}
                    </div>
                  ) : (
                    <div className="absolute bottom-14 right-1 flex flex-col gap-1 opacity-0 group-hover/card:opacity-100 transition-all duration-200">
                      <button
                        onClick={() => addMovie(r, false)}
                        className="bg-indigo-600/90 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-sm flex items-center justify-center hover:bg-indigo-500 transition-colors"
                        title="Add to library"
                      >
                        ➕
                      </button>
                      <button
                        onClick={() => addMovie(r, true)}
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
        )}
      </div>
    </div>
  );
}
