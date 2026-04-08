"use client";

import { useState, useEffect, useMemo } from "react";
import MovieCard from "./MovieCard";

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
  cda_url?: string | null;
  rated_at: string | null;
  created_at: string;
  [key: string]: any;
}

interface PersonRating {
  name: string;
  role: "director" | "writer" | "actor";
  avg_rating: number;
  movie_count: number;
  movies: {
    id: number;
    title: string;
    year: number | null;
    user_rating: number;
  }[];
}

interface PersonViewProps {
  name: string;
  movies: Movie[];
  onBack: () => void;
  onClickMovie: (movie: Movie) => void;
}

export default function PersonView({
  name,
  movies,
  onBack,
  onClickMovie,
}: PersonViewProps) {
  const [ratings, setRatings] = useState<PersonRating[]>([]);

  useEffect(() => {
    fetch(`/api/person-ratings?name=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then(setRatings)
      .catch(() => {});
  }, [name]);

  const nameLower = name.toLowerCase();

  const personMovies = useMemo(() => {
    return movies
      .filter((m) => {
        const inDirector = m.director
          ?.split(",")
          .some((d) => d.trim().toLowerCase() === nameLower);
        const inWriter = m.writer
          ?.split(",")
          .some((w) => w.trim().toLowerCase() === nameLower);
        const inActors = m.actors
          ?.split(",")
          .some((a) => a.trim().toLowerCase() === nameLower);
        return inDirector || inWriter || inActors;
      })
      .sort(
        (a, b) =>
          (b.user_rating ?? 0) - (a.user_rating ?? 0) ||
          (b.year ?? 0) - (a.year ?? 0),
      );
  }, [movies, nameLower]);

  const roles = useMemo(() => {
    const r: string[] = [];
    if (
      personMovies.some((m) =>
        m.director
          ?.split(",")
          .some((d) => d.trim().toLowerCase() === nameLower),
      )
    )
      r.push("Director");
    if (
      personMovies.some((m) =>
        m.writer?.split(",").some((w) => w.trim().toLowerCase() === nameLower),
      )
    )
      r.push("Writer");
    if (
      personMovies.some((m) =>
        m.actors?.split(",").some((a) => a.trim().toLowerCase() === nameLower),
      )
    )
      r.push("Actor");
    return r;
  }, [personMovies, nameLower]);

  const ratedMovies = personMovies.filter(
    (m) => m.user_rating != null && m.user_rating > 0,
  );
  const avgRating =
    ratedMovies.length > 0
      ? Math.round(
          (ratedMovies.reduce((sum, m) => sum + (m.user_rating ?? 0), 0) /
            ratedMovies.length) *
            10,
        ) / 10
      : null;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={onBack}
          className="text-gray-500 hover:text-white text-sm font-medium transition-colors mb-4 flex items-center gap-1"
        >
          <span>&#8592;</span> Back to Library
        </button>

        <div className="flex items-center gap-4">
          <h2 className="text-white text-2xl font-bold">{name}</h2>
          {avgRating !== null && (
            <span className="text-indigo-400 font-bold text-lg">
              {avgRating}/10
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 mt-2">
          {roles.map((role) => (
            <span
              key={role}
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg bg-gray-800 text-gray-400"
            >
              {role}
            </span>
          ))}
          <span className="text-gray-500 text-sm">
            {personMovies.length} movie{personMovies.length !== 1 ? "s" : ""} in
            library
            {ratedMovies.length > 0 && ` \u00b7 ${ratedMovies.length} rated`}
          </span>
        </div>
      </div>

      {/* Movie grid */}
      {personMovies.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-gray-500 text-sm">No movies found for {name}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {personMovies.map((m) => (
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
              onClick={() => onClickMovie(m)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
