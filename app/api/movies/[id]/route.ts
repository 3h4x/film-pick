import { NextRequest } from "next/server";
import { getDb, deleteMovie, type Movie } from "@/lib/db";
import { getTmdbMovieDetails, searchTmdb, getMovieLocalized } from "@/lib/tmdb";
import { cleanTitle } from "@/lib/utils";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execFileAsync = promisify(execFile);

interface FfprobeStream {
  codec_type: string;
  codec_name: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  profile?: string;
  level?: number;
  bit_rate?: string;
  channels?: number;
  tags?: { language?: string; title?: string };
}

interface VideoMetadata {
  format: string;
  size: number;
  duration: number;
  bitrate: number;
  video: {
    codec: string;
    width: number | undefined;
    height: number | undefined;
    pix_fmt: string | undefined;
    profile: string | undefined;
    level: number | undefined;
    bitrate: number;
  } | null;
  audio: { codec: string; channels: number | undefined; language: string | undefined; title: string | undefined }[];
  extra_files?: { path: string }[];
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const movie = db
    .prepare("SELECT * FROM movies WHERE id = ?")
    .get(parseInt(id, 10)) as (Movie & { video_metadata?: string | null; description?: string | null }) | undefined;

  if (!movie) {
    return Response.json({ error: "Movie not found" }, { status: 404 });
  }

  let metadata: VideoMetadata | { error: string } | null = null;
  if (movie.video_metadata) {
    try {
      metadata = JSON.parse(movie.video_metadata);
    } catch (e) {
      console.error("[Metadata] Error parsing cached metadata:", e);
    }
  }

  if (!metadata && movie.file_path && fs.existsSync(movie.file_path)) {
    try {
      const getMetadata = async (filePath: string): Promise<VideoMetadata> => {
        const { stdout } = await execFileAsync("ffprobe", [
          "-v",
          "quiet",
          "-print_format",
          "json",
          "-show_format",
          "-show_streams",
          filePath,
        ]);
        const ffprobeData = JSON.parse(stdout) as {
          streams: FfprobeStream[];
          format?: { format_long_name?: string; size?: string; duration?: string; bit_rate?: string };
        };
        const videoStream = ffprobeData.streams.find(
          (s) => s.codec_type === "video",
        );
        const audioStreams = ffprobeData.streams.filter(
          (s) => s.codec_type === "audio",
        );

        return {
          format: ffprobeData.format?.format_long_name ?? "",
          size: parseInt(ffprobeData.format?.size || "0"),
          duration: parseFloat(ffprobeData.format?.duration || "0"),
          bitrate: parseInt(ffprobeData.format?.bit_rate || "0"),
          video: videoStream
            ? {
                codec: videoStream.codec_name,
                width: videoStream.width,
                height: videoStream.height,
                pix_fmt: videoStream.pix_fmt,
                profile: videoStream.profile,
                level: videoStream.level,
                bitrate: parseInt(videoStream.bit_rate || "0"),
              }
            : null,
          audio: audioStreams.map((s) => ({
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
        (metadata as VideoMetadata).extra_files = extraMetadata;
      }

      // Save to DB
      db.prepare("UPDATE movies SET video_metadata = ? WHERE id = ?").run(
        JSON.stringify(metadata),
        parseInt(id, 10),
      );
    } catch (error) {
      console.error("[Metadata] Error fetching ffprobe data:", error);
      metadata = { error: "Failed to read video metadata (ffprobe)" };
    }
  }

  // Automatic TMDb linking if tmdb_id is missing, OR if this is a CDA movie with a pseudo-ID
  // (cda-fetch stores a hashCode-based fake tmdb_id when searchTmdbPl finds no match;
  //  these entries have no genre — use that as the sentinel)
  const needsAutoLink = !movie.tmdb_id || (!movie.genre && movie.cda_url);
  if (needsAutoLink) {
    const cleanedTitle = cleanTitle(movie.title);
    try {
      const results = await searchTmdb(cleanedTitle, movie.year);
      if (results.length > 0) {
        // Find best match: exact title match (ignoring case/punctuation) or first result
        const normalizedTitle = cleanedTitle
          .toLowerCase()
          .replace(/[:;!?()[\]{}]/g, "")
          .trim();
        const bestMatch =
          results.find(
            (r) =>
              r.title
                .toLowerCase()
                .replace(/[:;!?()[\]{}]/g, "")
                .trim() === normalizedTitle,
          ) || results[0];

        if (bestMatch) {
          console.log(
            `[Auto-Link] Found match for "${movie.title}": "${bestMatch.title}" (${bestMatch.tmdb_id})`,
          );

          // Get localized info
          const localized = await getMovieLocalized(bestMatch.tmdb_id);

          try {
            db.prepare(
              `
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
            `,
            ).run(
              bestMatch.tmdb_id,
              bestMatch.title,
              bestMatch.year || movie.year,
              bestMatch.genre,
              bestMatch.rating,
              bestMatch.poster_url,
              localized.pl_title,
              localized.description,
              parseInt(id, 10),
            );
          } catch (updateError) {
            // Another movie with the same (title, year) exists — keep original title/year, update everything else
            if ((updateError as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
              console.warn(
                `[Auto-Link] Title/year conflict for "${bestMatch.title}" (${bestMatch.year}), updating other fields only`,
              );
              db.prepare(
                `
                UPDATE movies SET
                  tmdb_id = ?,
                  genre = ?,
                  rating = ?,
                  poster_url = ?,
                  pl_title = ?,
                  description = ?,
                  source = 'tmdb'
                WHERE id = ?
              `,
              ).run(
                bestMatch.tmdb_id,
                bestMatch.genre,
                bestMatch.rating,
                bestMatch.poster_url,
                localized.pl_title,
                localized.description,
                parseInt(id, 10),
              );
            } else {
              throw updateError;
            }
          }

          // Update local object for response
          movie.tmdb_id = bestMatch.tmdb_id;
          movie.title = bestMatch.title;
          movie.year = bestMatch.year || movie.year;
          movie.genre = bestMatch.genre;
          movie.rating = bestMatch.rating;
          movie.poster_url = bestMatch.poster_url;
          movie.pl_title = localized.pl_title;
          movie.description = localized.description;
          movie.source = "tmdb";
        }
      }
    } catch (error) {
      console.error("[Auto-Link] Error searching TMDb:", error);
    }
  }

  // If the auto-link attempt above didn't resolve a pseudo-ID (cda_url set, genre still null),
  // skip further TMDb calls — the ID is still fake and would 404.
  const unresolvedPseudoId = needsAutoLink && movie.cda_url && !movie.genre;

  // Enrich with credits from TMDb (always overwrite — TMDb is authoritative)
  if (movie.tmdb_id && !unresolvedPseudoId && (!movie.director || !movie.writer || !movie.actors)) {
    try {
      const credits = await getTmdbMovieDetails(movie.tmdb_id);
      if (credits.director || credits.writer || credits.actors) {
        db.prepare(
          "UPDATE movies SET director = ?, writer = ?, actors = ? WHERE id = ?",
        ).run(
          credits.director,
          credits.writer,
          credits.actors,
          parseInt(id, 10),
        );
        movie.director = credits.director;
        movie.writer = credits.writer;
        movie.actors = credits.actors;
      }
    } catch (error) {
      console.error("[Credits] Error fetching TMDb credits:", error);
    }
  }

  // Enrich description and pl_title from TMDb if missing (covers CDA recs that already have tmdb_id)
  if (movie.tmdb_id && !unresolvedPseudoId && (!movie.description || !movie.pl_title)) {
    try {
      const localized = await getMovieLocalized(movie.tmdb_id);
      const sets: string[] = [];
      const vals: (string | null)[] = [];
      if (localized.pl_title && !movie.pl_title) {
        sets.push("pl_title = ?");
        vals.push(localized.pl_title);
        movie.pl_title = localized.pl_title;
      }
      if (localized.description && !movie.description) {
        sets.push("description = ?");
        vals.push(localized.description);
        movie.description = localized.description;
      }
      if (sets.length > 0) {
        db.prepare(`UPDATE movies SET ${sets.join(", ")} WHERE id = ?`).run(
          ...vals,
          parseInt(id, 10),
        );
      }
    } catch (error) {
      console.error("[Localized] Error fetching TMDb localized data:", error);
    }
  }

  return Response.json(
    JSON.parse(
      JSON.stringify({ movie, metadata }, (_k, v) =>
        typeof v === "bigint" ? Number(v) : v,
      ),
    ),
  );
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  deleteMovie(db, parseInt(id, 10));
  return Response.json({ ok: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const body = await request.json();

  // Validate fields at the system boundary before touching the DB
  if ("user_rating" in body && body.user_rating !== null) {
    const r = Number(body.user_rating);
    if (!Number.isFinite(r) || r < 1 || r > 10) {
      return Response.json(
        { error: "user_rating must be null or a number between 1 and 10" },
        { status: 400 },
      );
    }
  }
  if ("wishlist" in body && body.wishlist !== 0 && body.wishlist !== 1) {
    return Response.json(
      { error: "wishlist must be 0 or 1" },
      { status: 400 },
    );
  }
  if ("year" in body && body.year !== null) {
    const y = Number(body.year);
    if (!Number.isInteger(y) || y < 1888 || y > 2200) {
      return Response.json(
        { error: "year must be an integer between 1888 and 2200" },
        { status: 400 },
      );
    }
  }

  const allowed = [
    "user_rating",
    "rated_at",
    "wishlist",
    "title",
    "year",
    "genre",
    "rating",
    "poster_url",
    "tmdb_id",
    "imdb_id",
    "source",
  ] as const;
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  for (const key of allowed) {
    if (key in body) {
      sets.push(`${key} = ?`);
      values.push(body[key]);
    }
  }

  // Auto-set rated_at when user_rating is provided and rated_at not explicitly set
  if ("user_rating" in body && !("rated_at" in body)) {
    sets.push("rated_at = ?");
    values.push(body.user_rating != null ? new Date().toISOString() : null);
  }

  if (sets.length === 0) {
    return Response.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  try {
    values.push(parseInt(id, 10));
    db.prepare(`UPDATE movies SET ${sets.join(", ")} WHERE id = ?`).run(
      ...values,
    );
  } catch (error) {
    const e = error as { message?: string; code?: string };
    return Response.json(
      { error: e.message, code: e.code },
      { status: 500 },
    );
  }

  const updated = db
    .prepare("SELECT * FROM movies WHERE id = ?")
    .get(parseInt(id, 10));
  if (!updated) {
    return Response.json({ error: "Movie not found" }, { status: 404 });
  }
  return Response.json(
    JSON.parse(
      JSON.stringify(updated, (_k, v) =>
        typeof v === "bigint" ? Number(v) : v,
      ),
    ),
  );
}
