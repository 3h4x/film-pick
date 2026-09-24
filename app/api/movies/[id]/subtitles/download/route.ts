import { NextRequest } from "next/server";
import { getDb, Movie } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { downloadSubtitle } from "@/lib/subtitle-download";

/**
 * Download Polish subtitles for a movie's file from NapiProjekt/OpenSubtitles.
 * Refuses to touch a movie that already has subtitles unless `?replace=1`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "mutation");
  if (limited) return limited;
  const { id } = await params;
  const movieId = parseInt(id, 10);
  const movie = getDb()
    .prepare("SELECT * FROM movies WHERE id = ?")
    .get(movieId) as Movie | undefined;
  if (!movie || !movie.file_path) {
    return Response.json(
      { error: "Movie or file path not found" },
      { status: 404 },
    );
  }

  const result = await downloadSubtitle(
    {
      filePath: movie.file_path,
      imdbId: movie.imdb_id,
      tmdbId: movie.tmdb_id,
      title: movie.title,
      year: movie.year,
    },
    { replace: request.nextUrl.searchParams.get("replace") === "1" },
  );

  switch (result.status) {
    case "downloaded":
      return Response.json({ ok: true, ...result });
    case "exists":
      return Response.json(
        { error: "Movie already has subtitles", ...result },
        { status: 409 },
      );
    case "not_found":
      return Response.json(
        { error: "No Polish subtitles found", ...result },
        { status: 404 },
      );
    case "no_file":
      return Response.json(
        { error: "Movie file not found on disk", ...result },
        { status: 404 },
      );
    case "error":
      console.error(
        `[Subtitles] Download failed for movie ${movieId}: ${result.error}`,
      );
      return Response.json({ error: result.error }, { status: 500 });
  }
}
