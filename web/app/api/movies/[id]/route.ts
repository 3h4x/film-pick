import { NextRequest } from "next/server";
import { getDb, deleteMovie } from "@/lib/db";
import { getTmdbMovieDetails, searchTmdb, getMovieLocalized } from "@/lib/tmdb";
import { cleanTitle } from "@/lib/utils";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execFileAsync = promisify(execFile);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const movie = db.prepare("SELECT * FROM movies WHERE id = ?").get(parseInt(id, 10)) as any;

  if (!movie) {
    return Response.json({ error: "Movie not found" }, { status: 404 });
  }

  let metadata = null;
  if (movie.video_metadata) {
    try {
      metadata = JSON.parse(movie.video_metadata);
    } catch (e) {
      console.error("[Metadata] Error parsing cached metadata:", e);
    }
  }

  if (!metadata && movie.file_path && fs.existsSync(movie.file_path)) {
    try {
      const getMetadata = async (filePath: string) => {
        const { stdout } = await execFileAsync("ffprobe", [
          "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath
        ]);
        const ffprobeData = JSON.parse(stdout);
        const videoStream = ffprobeData.streams.find((s: any) => s.codec_type === "video");
        const audioStreams = ffprobeData.streams.filter((s: any) => s.codec_type === "audio");

        return {
          format: ffprobeData.format?.format_long_name,
          size: parseInt(ffprobeData.format?.size || "0"),
          duration: parseFloat(ffprobeData.format?.duration || "0"),
          bitrate: parseInt(ffprobeData.format?.bit_rate || "0"),
          video: videoStream ? {
            codec: videoStream.codec_name,
            width: videoStream.width,
            height: videoStream.height,
            pix_fmt: videoStream.pix_fmt,
            profile: videoStream.profile,
            level: videoStream.level,
            bitrate: parseInt(videoStream.bit_rate || "0"),
          } : null,
          audio: audioStreams.map((s: any) => ({
            codec: s.codec_name,
            channels: s.channels,
            language: s.tags?.language,
            title: s.tags?.title,
          })),
        };
      };

      metadata = await getMetadata(movie.file_path);

      // Also fetch metadata for extra files if present
      if (movie.extra_files) {
        const extras = JSON.parse(movie.extra_files);
        const extraMetadata = [];
        for (const extraPath of extras) {
          if (fs.existsSync(extraPath)) {
            const m = await getMetadata(extraPath);
            extraMetadata.push({ path: extraPath, ...m });
          }
        }
        (metadata as any).extra_files = extraMetadata;
      }

      // Save to DB
      db.prepare("UPDATE movies SET video_metadata = ? WHERE id = ?").run(
        JSON.stringify(metadata),
        parseInt(id, 10)
      );
    } catch (error: any) {
      console.error("[Metadata] Error fetching ffprobe data:", error);
      metadata = { error: "Failed to read video metadata (ffprobe)" };
    }
  }

  // Automatic TMDb linking if tmdb_id is missing
  if (!movie.tmdb_id) {
    const cleanedTitle = cleanTitle(movie.title);
    try {
      const results = await searchTmdb(cleanedTitle, movie.year);
      if (results.length > 0) {
        // Find best match: exact title match (ignoring case/punctuation) or first result
        const normalizedTitle = cleanedTitle.toLowerCase().replace(/[:;!?()[\]{}]/g, "").trim();
        const bestMatch = results.find(r => 
          r.title.toLowerCase().replace(/[:;!?()[\]{}]/g, "").trim() === normalizedTitle
        ) || results[0];

        if (bestMatch) {
          console.log(`[Auto-Link] Found match for "${movie.title}": "${bestMatch.title}" (${bestMatch.tmdb_id})`);
          
          // Get localized info
          const localized = await getMovieLocalized(bestMatch.tmdb_id);
          
          db.prepare(`
            UPDATE movies SET 
              tmdb_id = ?, 
              title = ?, 
              year = ?, 
              genre = ?, 
              rating = ?, 
              poster_url = ?, 
              pl_title = ?, 
              description = ?,
              source = 'tmdb'
            WHERE id = ?
          `).run(
            bestMatch.tmdb_id,
            bestMatch.title,
            bestMatch.year || movie.year,
            bestMatch.genre,
            bestMatch.rating,
            bestMatch.poster_url,
            localized.pl_title,
            localized.description,
            parseInt(id, 10)
          );

          // Update local object for response
          movie.tmdb_id = bestMatch.tmdb_id;
          movie.title = bestMatch.title;
          movie.year = bestMatch.year || movie.year;
          movie.genre = bestMatch.genre;
          movie.rating = bestMatch.rating;
          movie.poster_url = bestMatch.poster_url;
          movie.pl_title = localized.pl_title;
          movie.description = localized.description;
          movie.source = 'tmdb';
        }
      }
    } catch (error) {
      console.error("[Auto-Link] Error searching TMDb:", error);
    }
  }

  // Enrich with credits from TMDb (always overwrite — TMDb is authoritative)
  if (movie.tmdb_id && (!movie.director || !movie.writer || !movie.actors)) {
    try {
      const credits = await getTmdbMovieDetails(movie.tmdb_id);
      if (credits.director || credits.writer || credits.actors) {
        db.prepare("UPDATE movies SET director = ?, writer = ?, actors = ? WHERE id = ?")
          .run(credits.director, credits.writer, credits.actors, parseInt(id, 10));
        movie.director = credits.director;
        movie.writer = credits.writer;
        movie.actors = credits.actors;
      }
    } catch (error) {
      console.error("[Credits] Error fetching TMDb credits:", error);
    }
  }

  return Response.json(JSON.parse(JSON.stringify({ movie, metadata }, (_k, v) => typeof v === "bigint" ? Number(v) : v)));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  deleteMovie(db, parseInt(id, 10));
  return Response.json({ ok: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const body = await request.json();

  const allowed = ["user_rating", "wishlist", "title", "year", "genre", "rating", "poster_url", "tmdb_id", "imdb_id", "source"] as const;
  const sets: string[] = [];
  const values: any[] = [];

  for (const key of allowed) {
    if (key in body) {
      sets.push(`${key} = ?`);
      values.push(body[key]);
    }
  }

  if (sets.length === 0) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    values.push(parseInt(id, 10));
    db.prepare(`UPDATE movies SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  } catch (error: any) {
    return Response.json({ error: error.message, code: error.code }, { status: 500 });
  }

  const updated = db.prepare("SELECT * FROM movies WHERE id = ?").get(parseInt(id, 10));
  if (!updated) {
    return Response.json({ error: "Movie not found" }, { status: 404 });
  }
  return Response.json(JSON.parse(JSON.stringify(updated, (_k, v) => typeof v === "bigint" ? Number(v) : v)));
}
