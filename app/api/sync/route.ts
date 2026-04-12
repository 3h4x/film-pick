import {
  getDb,
  getSetting,
  insertMovie,
} from "@/lib/db";
import { scanDirectoryGenerator } from "@/lib/scanner";
import type { ScannedFile } from "@/lib/scanner";
import { searchTmdb } from "@/lib/tmdb";
import fs from "fs";

export async function POST() {
  const db = getDb();
  const libraryPath = getSetting(db, "library_path");

  if (!libraryPath) {
    return Response.json(
      { error: "No library path configured. Import first." },
      { status: 400 },
    );
  }

  if (!fs.existsSync(libraryPath)) {
    return Response.json(
      {
        error: `Library path not found: ${libraryPath}. If it is a network share, make sure it is mounted.`,
      },
      { status: 404 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendUpdate(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      // Phase 1: Scan — discover all files quickly (no network calls)
      const allFiles: ScannedFile[] = [];
      for (const file of scanDirectoryGenerator(libraryPath)) {
        allFiles.push(file);
        // Send discovery updates in batches to avoid flooding
        if (allFiles.length % 10 === 0 || allFiles.length === 1) {
          sendUpdate({ type: "scanning", count: allFiles.length });
        }
      }
      // Final scan count
      sendUpdate({ type: "scanning", count: allFiles.length });

      const filePathSet = new Set(allFiles.map((f) => f.filePath));

      // Build a set of all known file paths, including paths stored in extra_files,
      // so that alternate copies of the same movie aren't re-imported on every sync.
      const knownPaths = new Set<string>();
      const moviesWithPaths = db
        .prepare("SELECT file_path, extra_files FROM movies WHERE file_path IS NOT NULL AND file_path != ''")
        .all() as { file_path: string; extra_files: string | null }[];
      for (const m of moviesWithPaths) {
        knownPaths.add(m.file_path);
        if (m.extra_files) {
          try {
            const extras = JSON.parse(m.extra_files) as string[];
            for (const e of extras) knownPaths.add(e);
          } catch {}
        }
      }

      // Separate new files from existing
      const newFiles = allFiles.filter((f) => !knownPaths.has(f.filePath));
      const unchanged = allFiles.length - newFiles.length;

      sendUpdate({
        type: "scan_complete",
        total: allFiles.length,
        new_files: newFiles.length,
        unchanged,
      });

      // Phase 2: Sync — link files to existing DB entries or fetch metadata for truly new ones
      let added = 0;
      let linked = 0;
      let failed = 0;
      for (let i = 0; i < newFiles.length; i++) {
        const file = newFiles[i];
        // Small delay to avoid TMDb rate limits (~40 req/10s)
        if (i > 0) await new Promise((r) => setTimeout(r, 150));
        sendUpdate({
          type: "progress",
          current: i + 1,
          total: newFiles.length,
          filename: file.filename,
        });

        // First, check if a movie with the same parsed title+year already exists in DB
        // (e.g., from Filmweb import without file_path). Link the file directly — no TMDb needed.
        const existingByTitle = db
          .prepare(
            "SELECT id FROM movies WHERE LOWER(title) = LOWER(?) AND year = ? AND (file_path IS NULL OR file_path = '')",
          )
          .get(file.parsedTitle, file.parsedYear) as { id: number } | undefined;

        if (existingByTitle) {
          db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
            file.filePath,
            existingByTitle.id,
          );
          linked++;
          continue;
        }

        try {
          const searchResults = await searchTmdb(
            file.parsedTitle,
            file.parsedYear,
          );
          const match =
            searchResults.find((r) => {
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
          added++;
        } catch {
          // TMDb lookup failed — still add as local entry so the file isn't lost
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
          added++;
          failed++;
        }
      }

      // Phase 3: Cleanup — remove movies whose files no longer exist.
      // Query DB fresh (after Phase 2 updates) so we don't delete movies whose
      // file_path was just updated in Phase 2 from an old/wrong path.
      let removed = 0;
      const currentMovies = db
        .prepare(
          "SELECT id, file_path FROM movies WHERE file_path IS NOT NULL AND file_path != ''",
        )
        .all() as { id: number; file_path: string }[];
      for (const movie of currentMovies) {
        if (!filePathSet.has(movie.file_path)) {
          db.prepare("DELETE FROM movies WHERE id = ?").run(movie.id);
          removed++;
        }
      }

      sendUpdate({
        type: "complete",
        added,
        linked,
        removed,
        unchanged,
        failed,
        total: allFiles.length,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
