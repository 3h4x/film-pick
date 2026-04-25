import {
  getDb,
  getSetting,
  insertMovie,
} from "@/lib/db";
import { scanDirectoryGenerator } from "@/lib/scanner";
import type { ScannedFile } from "@/lib/scanner";
import { searchTmdb } from "@/lib/tmdb";
import { cleanTitle } from "@/lib/utils";
import type Database from "better-sqlite3";
import fs from "fs";

interface PathlessRow {
  id: number;
  title: string;
  year: number | null;
  tmdb_id: number | null;
}

// Try to attach a scanned file to an existing pathless DB row before
// inserting a new one. Returns true if a row was linked.
//
// Match priority:
//   1. tmdb_id (when TMDb gave us one)
//   2. exact LOWER(title) + year IS ?  (handles NULL year correctly,
//      unlike `year = ?` which never matches NULL)
//   3. cleanTitle equality + year tolerance (±1, mirroring the TMDb-side
//      tolerance), which covers wishlist rows whose stored title differs
//      in casing/punctuation/release-tag noise from the on-disk filename
function linkToExistingPathlessRow(
  db: Database.Database,
  file: ScannedFile,
  tmdbMatch: { tmdb_id?: number | null; title?: string; year?: number | null } | null,
): boolean {
  const link = (id: number) => {
    db.prepare(
      "UPDATE movies SET file_path = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(file.filePath, id);
  };

  if (tmdbMatch?.tmdb_id) {
    const byTmdb = db
      .prepare(
        "SELECT id FROM movies WHERE tmdb_id = ? AND (file_path IS NULL OR file_path = '')",
      )
      .get(tmdbMatch.tmdb_id) as { id: number } | undefined;
    if (byTmdb) {
      link(byTmdb.id);
      return true;
    }
  }

  const byTitleYear = db
    .prepare(
      "SELECT id FROM movies WHERE LOWER(title) = LOWER(?) AND year IS ? AND (file_path IS NULL OR file_path = '')",
    )
    .get(file.parsedTitle, file.parsedYear) as { id: number } | undefined;
  if (byTitleYear) {
    link(byTitleYear.id);
    return true;
  }

  // Normalized fallback for alt-title / punctuation-noise cases.
  const wantTitle = cleanTitle(file.parsedTitle).toLowerCase();
  if (!wantTitle) return false;
  const candidates = db
    .prepare(
      "SELECT id, title, year, tmdb_id FROM movies WHERE file_path IS NULL OR file_path = ''",
    )
    .all() as PathlessRow[];
  for (const c of candidates) {
    if (cleanTitle(c.title).toLowerCase() !== wantTitle) continue;
    if (file.parsedYear != null && c.year != null) {
      if (Math.abs(c.year - file.parsedYear) > 1) continue;
    }
    link(c.id);
    return true;
  }
  return false;
}

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

        // Fast path: link the file directly to an existing pathless row
        // (e.g., from Filmweb import or wishlist). No TMDb call needed.
        if (linkToExistingPathlessRow(db, file, null)) {
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

          // Even with a TMDb match, prefer linking to an existing pathless
          // row (matching by tmdb_id, exact title+year, or cleanTitle).
          // Only insert a new row if no linkable row exists.
          if (linkToExistingPathlessRow(db, file, match ?? null)) {
            linked++;
            continue;
          }

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
