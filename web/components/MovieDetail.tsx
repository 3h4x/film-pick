"use client";

import { useState, useEffect } from "react";

interface Movie {
  id: number;
  title: string;
  year: number | null;
  genre: string | null;
  director: string | null;
  rating: number | null;
  user_rating: number | null;
  poster_url: string | null;
  source: string | null;
  tmdb_id?: number | null;
  filmweb_url?: string | null;
  cda_url?: string | null;
  pl_title?: string | null;
  description?: string | null;
  rated_at?: string | null;
}

interface MovieDetailProps {
  movie: Movie;
  onClose: () => void;
}

export default function MovieDetail({ movie, onClose }: MovieDetailProps) {
  const [plTitle, setPlTitle] = useState<string | null>(movie.pl_title || null);
  const [description, setDescription] = useState<string | null>(movie.description || null);

  useEffect(() => {
    if ((!plTitle || !description) && movie.tmdb_id) {
      fetch(`/api/pl-title?tmdb_id=${movie.tmdb_id}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.pl_title && !plTitle) setPlTitle(d.pl_title);
          if (d.description && !description) setDescription(d.description);
        })
        .catch(() => {});
    }
  }, [movie.tmdb_id, plTitle, description]);
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-6">
          {/* Poster */}
          <div className="flex-shrink-0 w-48">
            {movie.poster_url ? (
              <img
                src={movie.poster_url}
                alt={movie.title}
                className="w-full rounded-xl shadow-lg"
              />
            ) : (
              <div className="w-full aspect-[2/3] bg-gray-800 rounded-xl flex items-center justify-center">
                <span className="text-5xl opacity-30">🎬</span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">{movie.title}</h2>
                {plTitle && plTitle !== movie.title && (
                  <p className="text-gray-500 text-sm mt-0.5">{plTitle}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-white transition-colors w-8 h-8 rounded-lg hover:bg-gray-800 flex items-center justify-center flex-shrink-0"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {movie.year && (
                <span className="text-gray-400 text-sm">{movie.year}</span>
              )}
              {movie.source && (
                <span className="text-[10px] font-medium px-2 py-0.5 bg-gray-800 text-gray-400 rounded-md uppercase tracking-wider">
                  {movie.source}
                </span>
              )}
            </div>

            {/* Ratings */}
            <div className="flex items-center gap-4 mt-4">
              {movie.user_rating != null && movie.user_rating > 0 && (
                <div className="flex items-center gap-2">
                  <div className="bg-indigo-500/20 text-indigo-300 font-bold text-lg px-3 py-1 rounded-lg">
                    {movie.user_rating}/10
                  </div>
                  <span className="text-gray-500 text-xs">Your rating</span>
                </div>
              )}
              {movie.rating != null && movie.rating > 0 && (
                <div className="flex items-center gap-2">
                  <div className="bg-yellow-500/10 text-yellow-400 font-bold text-lg px-3 py-1 rounded-lg">
                    ★ {movie.rating}
                  </div>
                  <span className="text-gray-500 text-xs">Global</span>
                </div>
              )}
            </div>

            {/* Genre */}
            {movie.genre && (
              <div className="flex flex-wrap gap-1.5 mt-4">
                {movie.genre.split(", ").map((g) => (
                  <span
                    key={g}
                    className="text-xs px-2.5 py-1 bg-gray-800/80 text-gray-300 rounded-lg"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Director */}
            {movie.director && (
              <p className="text-gray-400 text-sm mt-4">
                Directed by <span className="text-white">{movie.director}</span>
              </p>
            )}

            {/* Description */}
            {description && (
              <p className="text-gray-400 text-sm mt-4 leading-relaxed">{description}</p>
            )}

            {/* Rated date */}
            {movie.rated_at && (
              <p className="text-gray-600 text-xs mt-3">
                Rated on {movie.rated_at}
              </p>
            )}

            {/* Links */}
            <div className="flex flex-wrap gap-3 mt-4">
              {movie.filmweb_url && (
                <a
                  href={movie.filmweb_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Filmweb ↗
                </a>
              )}
              <a
                href={movie.cda_url || `https://www.cda.pl/szukaj?q=${encodeURIComponent((plTitle || movie.title) + (movie.year ? ` ${movie.year}` : ""))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                CDA.pl ↗
              </a>
              {movie.tmdb_id && (
                <a
                  href={`https://www.themoviedb.org/movie/${movie.tmdb_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  TMDb ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
