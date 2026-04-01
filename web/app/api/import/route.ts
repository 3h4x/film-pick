import { NextRequest } from "next/server";
import { getDb, insertMovie, getMovieByFilePath, setSetting } from "@/lib/db";
import { scanDirectory } from "@/lib/scanner";
import { searchTmdb } from "@/lib/tmdb";

export async function POST(request: NextRequest) {
  const { path: dirPath } = await request.json();

  if (!dirPath || typeof dirPath !== "string") {
    return Response.json({ error: "Path is required" }, { status: 400 });
  }

  const db = getDb();

  // Save the library path for future syncs
  setSetting(db, "library_path", dirPath);

  const files = scanDirectory(dirPath);
  const results = { added: 0, skipped: 0, failed: 0, total: files.length };

  for (const file of files) {
    // Skip if already imported
    if (getMovieByFilePath(db, file.filePath)) {
      results.skipped++;
      continue;
    }

    // Search TMDb for metadata
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
        results.added++;
      } else {
        // Add with parsed info only (no TMDb match)
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
        results.added++;
      }
    } catch {
      results.failed++;
    }
  }

  return Response.json(results);
}
