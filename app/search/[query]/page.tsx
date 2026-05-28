"use client";
// tamtam inspected 2026-05-21

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import MovieCard from "@/components/MovieCard";
import EmptyState from "@/components/ui/EmptyState";
import Spinner from "@/components/ui/Spinner";
import type { TmdbSearchResult } from "@/lib/tmdb";

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

  const [results, setResults] = useState<TmdbSearchResult[]>([]);
  const [library, setLibrary] = useState<Set<number>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState<Set<number>>(() => new Set());

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
        const tmdbIds: number[] = [];
        for (const movie of movies) {
          if (movie.tmdb_id) tmdbIds.push(movie.tmdb_id);
        }
        setLibrary(new Set(tmdbIds));
      }
      setLoading(false);
    }
    load();
  }, [decoded]);

  async function addMovie(result: TmdbSearchResult, wishlist: boolean) {
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
            <Spinner />
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            message={
              <>
                No results for &ldquo;{decoded}&rdquo;
              </>
            }
            subtext="Try a different title or check spelling"
          />
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
                  />
                  {inLibrary ? (
                    <div className="absolute top-1.5 left-1.5 bg-green-600/90 text-white text-xs px-1.5 py-0.5 rounded font-medium">
                      {justAdded ? "Added" : "In library"}
                    </div>
                  ) : (
                    <div className="absolute bottom-14 right-1 flex flex-col gap-1 rounded-xl border border-gray-800/70 bg-black/35 p-1 opacity-100 shadow-lg backdrop-blur-sm transition-all duration-200 sm:border-transparent sm:bg-transparent sm:p-0 sm:opacity-0 sm:shadow-none sm:backdrop-blur-0 sm:group-hover/card:opacity-100">
                      <button
                        onClick={() => addMovie(r, false)}
                        aria-label={`Add ${r.title} to library`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600/95 text-sm text-white transition-colors hover:bg-indigo-500 sm:h-7 sm:w-7"
                        title="Add to library"
                      >
                        ➕
                      </button>
                      <button
                        onClick={() => addMovie(r, true)}
                        aria-label={`Add ${r.title} to watchlist`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/95 text-sm text-white transition-colors hover:bg-blue-500 sm:h-7 sm:w-7"
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
