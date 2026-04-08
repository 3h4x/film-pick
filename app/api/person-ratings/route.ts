import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

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

function buildPersonMap(
  ratedMovies: any[],
  filterNames?: Set<string>,
): Map<string, PersonRating> {
  const personMap = new Map<string, PersonRating>();

  const addPerson = (
    personName: string,
    personRole: "director" | "writer" | "actor",
    movie: any,
  ) => {
    if (filterNames && !filterNames.has(personName.toLowerCase())) return;
    const key = `${personName}::${personRole}`;
    if (!personMap.has(key)) {
      personMap.set(key, {
        name: personName,
        role: personRole,
        avg_rating: 0,
        movie_count: 0,
        movies: [],
      });
    }
    const p = personMap.get(key)!;
    p.movies.push({
      id: movie.id,
      title: movie.title,
      year: movie.year,
      user_rating: movie.user_rating,
    });
    p.movie_count++;
  };

  for (const movie of ratedMovies) {
    if (movie.director) {
      for (const d of movie.director
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)) {
        addPerson(d, "director", movie);
      }
    }
    if (movie.writer) {
      for (const w of movie.writer
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)) {
        addPerson(w, "writer", movie);
      }
    }
    if (movie.actors) {
      for (const a of movie.actors
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)) {
        addPerson(a, "actor", movie);
      }
    }
  }

  for (const p of personMap.values()) {
    p.avg_rating =
      Math.round(
        (p.movies.reduce((sum, m) => sum + m.user_rating, 0) / p.movie_count) *
          10,
      ) / 10;
  }

  return personMap;
}

export async function GET(request: NextRequest) {
  const db = getDb();
  const name = request.nextUrl.searchParams.get("name");
  const names = request.nextUrl.searchParams.getAll("names");

  const ratedMovies = db
    .prepare(
      "SELECT id, title, year, director, writer, actors, user_rating FROM movies WHERE user_rating IS NOT NULL AND user_rating > 0",
    )
    .all() as any[];

  // Batch or single person lookup
  if (names.length > 0 || name) {
    const filterSet = new Set(
      (names.length > 0 ? names : [name!]).map((n) => n.toLowerCase()),
    );
    const personMap = buildPersonMap(ratedMovies, filterSet);
    return Response.json(Array.from(personMap.values()));
  }

  // Top-rated people
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20", 10);
  const role = request.nextUrl.searchParams.get("role") as
    | "director"
    | "writer"
    | "actor"
    | null;

  const personMap = buildPersonMap(ratedMovies);

  const results = Array.from(personMap.values())
    .filter((p) => p.movie_count >= 2 && (!role || p.role === role))
    .sort(
      (a, b) => b.avg_rating - a.avg_rating || b.movie_count - a.movie_count,
    )
    .slice(0, limit);

  return Response.json(results);
}
