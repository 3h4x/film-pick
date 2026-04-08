import { NextRequest } from "next/server";
import { getDb, insertMovie, getMovieByFilePath, setSetting } from "@/lib/db";
import { scanDirectoryGenerator } from "@/lib/scanner";
import { searchTmdb } from "@/lib/tmdb";
import fs from "fs";

export async function POST(request: NextRequest) {
  const { path: dirPath } = await request.json();

  if (!dirPath || typeof dirPath !== "string") {
    return Response.json({ error: "Path is required" }, { status: 400 });
  }

  if (!fs.existsSync(dirPath)) {
    return Response.json({
      error: `Directory not found: ${dirPath}. If it is a network share, make sure it is mounted.`
    }, { status: 404 });
  }

  const db = getDb();

  // Save the library path for future syncs
  setSetting(db, "library_path", dirPath);

  const results = { added: 0, skipped: 0, failed: 0, total: 0 };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendUpdate(data: any) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      // Process each file as it's discovered
      for (const file of scanDirectoryGenerator(dirPath)) {
        results.total++;

        // Immediate discovery update
        sendUpdate({
          type: "discovery",
          count: results.total,
          filename: file.filename
        });

        // Progress update before processing
        sendUpdate({
          type: "progress",
          current: results.total,
          total: results.total, // Total is growing as we discover
          filename: file.filename
        });

        // Skip if already imported
        if (getMovieByFilePath(db, file.filePath)) {
          results.skipped++;
        } else {
          // Search TMDb for metadata
          try {
            const searchResults = await searchTmdb(file.parsedTitle, file.parsedYear);
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
      }

      // Final result
      sendUpdate({ type: "complete", ...results });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
