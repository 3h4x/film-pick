import { getDb, getMovies, getSetting, insertMovie, getMovieByFilePath } from "@/lib/db";
import { scanDirectory } from "@/lib/scanner";
import { searchTmdb } from "@/lib/tmdb";
import fs from "fs";

export async function POST() {
  const db = getDb();
  const libraryPath = getSetting(db, "library_path");

  if (!libraryPath) {
    return Response.json({ error: "No library path configured. Import first." }, { status: 400 });
  }

  const files = scanDirectory(libraryPath);
  const filePathSet = new Set(files.map((f) => f.filePath));
  const existingMovies = getMovies(db);

  const results = { added: 0, removed: 0, unchanged: 0 };

  // Find new files not yet in DB
  for (const file of files) {
    if (getMovieByFilePath(db, file.filePath)) {
      results.unchanged++;
      continue;
    }

    try {
      const searchResults = await searchTmdb(file.parsedTitle);
      const match = searchResults.find((r) => {
        if (file.parsedYear && r.year) {
          return Math.abs(r.year - file.parsedYear) <= 1;
        }
        return true;
      }) || searchResults[0];

      if (match) {
        insertMovie(db, {
          title: match.title,
          year: match.year,
          genre: match.genre,
          director: null,
          rating: match.rating,
          poster_url: match.poster_url,
          source: "tmdb",
          imdb_id: match.imdb_id,
          tmdb_id: match.tmdb_id,
          type: "movie",
          file_path: file.filePath,
        });
      } else {
        insertMovie(db, {
          title: file.parsedTitle,
          year: file.parsedYear,
          genre: null,
          director: null,
          rating: null,
          poster_url: null,
          source: "local",
          imdb_id: null,
          tmdb_id: null,
          type: "movie",
          file_path: file.filePath,
        });
      }
      results.added++;
    } catch {
      // Skip failed lookups during sync
    }
  }

  // Mark movies whose files no longer exist
  for (const movie of existingMovies) {
    if (movie.file_path && !filePathSet.has(movie.file_path)) {
      // File was removed from disk — remove from library
      db.prepare("DELETE FROM movies WHERE id = ?").run(movie.id);
      results.removed++;
    }
  }

  return Response.json(results);
}
