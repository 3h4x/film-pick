import {
  enrichMovieMetadata,
  getDb,
  getExistingMovieInsertTargetId,
  insertMovie,
  type MovieInput,
  movieNeedsTmdbEnrichment,
} from "@/lib/db";
import { getLibraryFolders, isWithinFolder } from "@/lib/library-folders";
import { refreshStaleTmdbMetadata } from "@/lib/tmdb-refresh";
import { rematchLocalMovies } from "@/lib/tmdb-rematch";
import { SYNC_ENRICH_OPTIONS, SYNC_REMATCH_OPTIONS } from "@/lib/tmdb-enrich-options";
import { linkToExistingPathlessRow } from "@/lib/pathless-row-link";
import { scanLibraryGenerator } from "@/lib/scanner";
import type { ScanStats } from "@/lib/scanner";
import {
  createDbScanCache,
  markFullScan,
  shouldForceFullScan,
} from "@/lib/scan-cache";
import type { ScannedFile } from "@/lib/scanner";
import { searchTmdb } from "@/lib/tmdb";
import { selectTmdbSearchCandidates } from "@/lib/tmdb-match";
import { rateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";
import fs from "fs";

function parseExtraFiles(extraFiles: string | null): string[] {
  if (!extraFiles) return [];
  try {
    const parsed = JSON.parse(extraFiles) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((path): path is string => typeof path === "string");
  } catch {
    return [];
  }
}

export async function POST(request?: NextRequest) {
  const limited = request ? rateLimit(request, "mutation") : null;
  if (limited) return limited;
  const db = getDb();
  // `?full=1` re-lists every directory; otherwise unchanged directories are
  // skipped, except that a full scan is forced once a week as a safety net.
  const requestedFull = request?.nextUrl.searchParams.get("full") === "1";
  const fullScan = requestedFull || shouldForceFullScan(db);
  const { primary: libraryPath, extras } = getLibraryFolders(db);

  if (!libraryPath) {
    return Response.json(
      { error: "No library path configured. Import first." },
      { status: 400 },
    );
  }

  // The primary folder is required; an unmounted extra folder is skipped so one
  // offline share does not block syncing the rest.
  if (!fs.existsSync(libraryPath)) {
    return Response.json(
      {
        error: `Library path not found: ${libraryPath}. If it is a network share, make sure it is mounted.`,
      },
      { status: 404 },
    );
  }
  const scanRoots = [libraryPath];
  const unavailableRoots: string[] = [];
  for (const extra of extras) {
    (fs.existsSync(extra) ? scanRoots : unavailableRoots).push(extra);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // The client may close the modal mid-sync; the work should still finish.
      let clientGone = false;
      function sendUpdate(data: Record<string, unknown>) {
        if (clientGone) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        } catch {
          clientGone = true;
        }
      }

      // Phase 1: Scan — discover all files quickly (no network calls)
      const allFiles: ScannedFile[] = [];
      const seenFiles = new Set<string>();
      if (unavailableRoots.length > 0) {
        sendUpdate({ type: "skipped_roots", roots: unavailableRoots });
      }
      const scanStats: ScanStats = { dirsListed: 0, dirsCached: 0 };
      for (const root of scanRoots) {
        const { cache, flush } = createDbScanCache(db, root);
        for await (const file of scanLibraryGenerator(root, {
          cache,
          full: fullScan,
          stats: scanStats,
        })) {
          // Folders may overlap; never process the same file twice.
          if (seenFiles.has(file.filePath)) continue;
          seenFiles.add(file.filePath);
          allFiles.push(file);
          // Send discovery updates in batches to avoid flooding
          if (allFiles.length % 10 === 0 || allFiles.length === 1) {
            sendUpdate({ type: "scanning", count: allFiles.length });
          }
        }
        // The walk finished, so what it listed is safe to remember and what it
        // did not reach is gone.
        flush({ prune: true });
      }
      if (fullScan) markFullScan(db);
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
        for (const e of parseExtraFiles(m.extra_files)) knownPaths.add(e);
      }

      // Separate new files from existing
      const newFiles = allFiles.filter((f) => !knownPaths.has(f.filePath));
      const unchanged = allFiles.length - newFiles.length;

      sendUpdate({
        type: "scan_complete",
        total: allFiles.length,
        new_files: newFiles.length,
        unchanged,
        full_scan: fullScan,
        dirs_listed: scanStats.dirsListed,
        dirs_cached: scanStats.dirsCached,
      });

      // Phase 2: Sync — link files to existing DB entries or fetch metadata for truly new ones
      let added = 0;
      let linked = 0;
      let failed = 0;
      function insertAndCount(movie: MovieInput) {
        const existingTargetId = getExistingMovieInsertTargetId(db, movie);
        insertMovie(db, movie);
        if (existingTargetId != null) {
          linked++;
        } else {
          added++;
        }
      }

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
        const linkedRowId = linkToExistingPathlessRow(db, file, null);
        const shouldEnrichLinkedRow =
          linkedRowId != null && movieNeedsTmdbEnrichment(db, linkedRowId);

        if (linkedRowId != null && !shouldEnrichLinkedRow) {
          linked++;
          continue;
        }

        try {
          const searchResults = await searchTmdb(
            file.parsedTitle,
            file.parsedYear,
          );
          const { strongMatch, fallbackMatch } = selectTmdbSearchCandidates(
            searchResults,
            file.parsedTitle,
            file.parsedYear,
          );

          if (linkedRowId != null) {
            if (strongMatch) {
              enrichMovieMetadata(db, linkedRowId, {
                title: strongMatch.title,
                year: strongMatch.year,
                genre: strongMatch.genre,
                director: null,
                rating: strongMatch.rating,
                poster_url: strongMatch.poster_url,
                source: "tmdb",
                imdb_id: strongMatch.imdb_id,
                tmdb_id: strongMatch.tmdb_id,
                type: "movie",
              });
            }
            linked++;
            continue;
          }

          // Even with a TMDb match, prefer linking to an existing pathless
          // row (matching by tmdb_id, exact title+year, or cleanTitle).
          // Only insert a new row if no linkable row exists.
          if (linkToExistingPathlessRow(db, file, strongMatch)) {
            linked++;
            continue;
          }

          if (fallbackMatch) {
            insertAndCount({
              title: fallbackMatch.title,
              year: fallbackMatch.year,
              genre: fallbackMatch.genre,
              director: null,
              rating: fallbackMatch.rating,
              poster_url: fallbackMatch.poster_url,
              source: "tmdb",
              imdb_id: fallbackMatch.imdb_id,
              tmdb_id: fallbackMatch.tmdb_id,
              type: "movie",
              file_path: file.filePath,
            });
          } else {
            insertAndCount({
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
        } catch {
          if (linkedRowId != null) {
            linked++;
            continue;
          }
          // TMDb lookup failed — still add as local entry so the file isn't lost
          insertAndCount({
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
          failed++;
        }
      }

      // Phase 3: Cleanup — detach files that no longer exist from their movie rows.
      // Query DB fresh (after Phase 2 updates) so we don't detach movies whose
      // file_path was just updated in Phase 2 from an old/wrong path.
      let detached = 0;
      const currentMovies = db
        .prepare(
          "SELECT id, file_path, extra_files FROM movies WHERE file_path IS NOT NULL AND file_path != ''",
        )
        .all() as { id: number; file_path: string; extra_files: string | null }[];
      const updateExtrasStmt = db.prepare(
        "UPDATE movies SET extra_files = ?, video_metadata = NULL WHERE id = ?",
      );
      const promoteExtraStmt = db.prepare(
        "UPDATE movies SET file_path = ?, extra_files = ?, video_metadata = NULL WHERE id = ?",
      );
      const detachStmt = db.prepare(
        "UPDATE movies SET file_path = NULL, extra_files = NULL, video_metadata = NULL WHERE id = ?",
      );
      for (const movie of currentMovies) {
        // Files on an offline folder are unknown, not deleted: leave them attached.
        if (unavailableRoots.some((root) => isWithinFolder(root, movie.file_path))) {
          continue;
        }
        const existingExtras = parseExtraFiles(movie.extra_files).filter(
          (extraPath) => filePathSet.has(extraPath),
        );

        if (filePathSet.has(movie.file_path)) {
          const nextExtraFiles =
            existingExtras.length > 0 ? JSON.stringify(existingExtras) : null;
          if (nextExtraFiles !== movie.extra_files) {
            updateExtrasStmt.run(nextExtraFiles, movie.id);
          }
          continue;
        }

        if (existingExtras.length > 0) {
          const [promotedPath, ...remainingExtras] = existingExtras;
          promoteExtraStmt.run(
            promotedPath,
            remainingExtras.length > 0 ? JSON.stringify(remainingExtras) : null,
            movie.id,
          );
          continue;
        }

        detachStmt.run(movie.id);
        detached++;
      }

      // Phase 4: TMDb details (Polish title, description, director, writer, actors,
      // collection), so films found by this sync are searchable by name, director
      // and cast without opening them first. Movies refreshed recently are skipped.
      let enriched = 0;
      let rematched = 0;
      try {
        // Films added earlier without a TMDb id get another chance first, so a
        // match found now is enriched in this same pass.
        const rematch = await rematchLocalMovies(db, {
          ...SYNC_REMATCH_OPTIONS,
          onProgress: (current, total) =>
            sendUpdate({ type: "matching", current, total }),
        });
        rematched = rematch.matched;
        const result = await refreshStaleTmdbMetadata(db, {
          ...SYNC_ENRICH_OPTIONS,
          onProgress: (current, total) =>
            sendUpdate({ type: "enriching", current, total }),
        });
        enriched = result.updated;
      } catch (error) {
        console.error("[Sync] enrich step failed:", error);
      }

      sendUpdate({
        type: "complete",
        enriched,
        rematched,
        added,
        linked,
        detached,
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
