import { NextRequest } from "next/server";
import { getDb, getMovies, insertMovie, type MovieInput } from "@/lib/db";

export async function GET(request: NextRequest) {
  const db = getDb();
  const type = request.nextUrl.searchParams.get("type") || undefined;
  const movies = getMovies(db, type);
  return Response.json(movies);
}

export async function POST(request: NextRequest) {
  const db = getDb();
  const body = await request.json();

  if (!body.title) {
    return Response.json({ error: "Title is required" }, { status: 400 });
  }

  const movieInput: MovieInput = {
    title: body.title,
    year: body.year ?? null,
    genre: body.genre ?? null,
    director: body.director ?? null,
    rating: body.rating ?? null,
    poster_url: body.poster_url ?? null,
    source: body.source ?? null,
    imdb_id: body.imdb_id ?? null,
    tmdb_id: body.tmdb_id ?? null,
    type: body.type ?? "movie",
    file_path: body.file_path ?? null,
  };

  const id = insertMovie(db, movieInput);

  // Set extra columns if provided (added via migrations, not in base schema)
  try {
    if (body.user_rating != null) {
      db.prepare("UPDATE movies SET user_rating = ? WHERE id = ?").run(body.user_rating, id);
    }
    if (body.wishlist != null) {
      db.prepare("UPDATE movies SET wishlist = ? WHERE id = ?").run(body.wishlist, id);
    }
    if (body.cda_url) {
      db.prepare("UPDATE movies SET cda_url = ? WHERE id = ?").run(body.cda_url, id);
    }
  } catch {}

  return Response.json({ id }, { status: 201 });
}
