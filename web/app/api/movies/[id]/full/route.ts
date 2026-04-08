import { NextRequest } from "next/server";
import { getDb, deleteMovie } from "@/lib/db";
import fs from "fs";
import path from "path";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const movieId = parseInt(id, 10);

  const movie = db.prepare("SELECT * FROM movies WHERE id = ?").get(movieId) as any;
  if (!movie) {
    return Response.json({ error: "Movie not found" }, { status: 404 });
  }

  // Get library root from settings
  const setting = db.prepare("SELECT value FROM settings WHERE key = 'library_path'").get() as { value: string } | undefined;
  const libraryRoot = setting?.value || "/Volumes/video/Movies";

  if (movie.file_path) {
    const filePath = movie.file_path;
    const parentDir = path.dirname(filePath);

    // Safety check: Don't delete the library root!
    const resolvedLibraryRoot = path.resolve(libraryRoot);
    const resolvedParentDir = path.resolve(parentDir);

    if (resolvedParentDir === resolvedLibraryRoot) {
      // The movie is directly in the library root (not in its own folder)
      // We should only delete the file, not the folder.
      console.log(`[Delete] Movie file is in library root, only deleting the file: ${filePath}`);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        // Also delete extra files
        if (movie.extra_files) {
          try {
            const extras = JSON.parse(movie.extra_files);
            for (const extra of extras) {
              if (fs.existsSync(extra)) {
                fs.unlinkSync(extra);
              }
            }
          } catch (e) {
            console.error(`[Delete] Error parsing extra files:`, e);
          }
        }

        // Also try to find and delete subtitles (same name, diff extension)
        const baseExt = path.extname(filePath);
        const baseName = path.basename(filePath, baseExt);
        const subExtensions = [".srt", ".ass", ".sub", ".txt", ".vtt"];
        for (const ext of subExtensions) {
          const subPath = path.join(parentDir, baseName + ext);
          if (fs.existsSync(subPath)) {
            fs.unlinkSync(subPath);
          }
        }
      } catch (e: any) {
        console.error(`[Delete] Error deleting movie files: ${e.message}`);
        return Response.json({ error: `Failed to delete movie files: ${e.message}` }, { status: 500 });
      }
    } else if (resolvedParentDir.startsWith(resolvedLibraryRoot + path.sep) || resolvedParentDir === resolvedLibraryRoot) {
      // This case handles movies in subdirectories
      // Double check it's NOT just the library root again
      if (resolvedParentDir !== resolvedLibraryRoot) {
        console.log(`[Delete] Deleting folder: ${parentDir}`);
        try {
          if (fs.existsSync(parentDir)) {
            // Safety check against deleting sensitive system/library folders
            const folderName = path.basename(parentDir).toLowerCase();
            const forbidden = ["movies", "video", "volumes", "00_new", "downloads", "desktop", "documents", "Applications", "Library", "System", "Users"];
            if (forbidden.some(f => folderName === f.toLowerCase())) {
               throw new Error(`Folder name "${folderName}" is protected and cannot be deleted.`);
            }

            // Try to delete recursively. Sometimes network shares fail with ENOTEMPTY
            // even with recursive: true if there are hidden files or race conditions.
            // Also handle ENOENT if files disappear mid-operation (like .afpDeleted*)
            try {
              if (fs.existsSync(parentDir)) {
                fs.rmSync(parentDir, { recursive: true, force: true });
              }
            } catch (innerError: any) {
              if (innerError.code === 'ENOTEMPTY') {
                 console.log(`[Delete] ENOTEMPTY caught for ${parentDir}. Attempting manual content clearing.`);
                 // Final attempt: clear contents manually then delete folder
                 try {
                   const files = fs.readdirSync(parentDir);
                   for (const file of files) {
                     const curPath = path.join(parentDir, file);
                     try {
                       if (fs.existsSync(curPath)) {
                         const stats = fs.lstatSync(curPath);
                         if (stats.isDirectory()) {
                           fs.rmSync(curPath, { recursive: true, force: true });
                         } else {
                           fs.unlinkSync(curPath);
                         }
                       }
                     } catch (fileErr: any) {
                       // Ignore if file disappeared or is already being handled (common on network shares)
                       if (fileErr.code !== 'ENOENT') {
                         console.warn(`[Delete] Warning: Failed to delete item ${curPath} during cleanup: ${fileErr.message}`);
                       }
                     }
                   }
                   // Final attempt to remove the directory itself
                   if (fs.existsSync(parentDir)) {
                     try {
                        fs.rmdirSync(parentDir);
                     } catch (finalDirErr: any) {
                        // If it still says not empty, it's likely a persistent network share artifact (.afpDeleted*)
                        // We will log it but CONTINUE to delete the DB record.
                        if (finalDirErr.code === 'ENOTEMPTY') {
                          console.warn(`[Delete] Folder still not empty after manual cleanup (likely .afpDeleted*): ${parentDir}`);
                        } else if (finalDirErr.code !== 'ENOENT') {
                          throw finalDirErr;
                        }
                     }
                   }
                 } catch (dirErr: any) {
                   if (dirErr.code !== 'ENOENT') throw dirErr;
                 }
              } else if (innerError.code !== 'ENOENT') {
                throw innerError;
              }
            }
          }
        } catch (e: any) {
          console.error(`[Delete] Error deleting movie folder: ${e.message}`);
          // If the folder is already gone (ENOENT), we can still proceed to delete from DB
          if (e.code !== 'ENOENT') {
            return Response.json({ error: `Failed to delete movie folder: ${e.message}` }, { status: 500 });
          }
        }
      }
    } else {
      console.warn(`[Delete] Parent directory ${parentDir} is not within library root ${libraryRoot}. Skipping file deletion for safety.`);
    }
  }

  // Check if we should keep the DB entry (disk-only deletion)
  const url = new URL(_request.url);
  const diskOnly = url.searchParams.get("disk_only") === "1";

  if (diskOnly) {
    // Clear file_path and video_metadata but keep all other data (ratings, metadata, etc.)
    db.prepare("UPDATE movies SET file_path = NULL, extra_files = NULL, video_metadata = NULL WHERE id = ?").run(movieId);
    return Response.json({ ok: true, message: "Movie folder deleted from disk. Database entry preserved." });
  }

  // Delete from database
  try {
    deleteMovie(db, movieId);
  } catch (dbErr: any) {
    console.error(`[Delete] Error deleting movie from database: ${dbErr.message}`);
    return Response.json({ error: `Failed to delete movie from database: ${dbErr.message}` }, { status: 500 });
  }

  return Response.json({ ok: true, message: "Movie removed from disk and database" });
}
