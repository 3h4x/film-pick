import { DEFAULT_SUBTITLE_LANGUAGE, isSubtitleLanguage } from "@/lib/subtitle-language";
import { NextRequest } from "next/server";
import { getDb, getSetting, Movie } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { fetchMovieSubtitles } from "@/lib/subtitle-download";
import { subtitleCheckFromRow } from "@/lib/subtitle-check";

/**
 * Download subtitles in the requested language for a movie's file from NapiProjekt/OpenSubtitles.
 * Refuses to touch a movie that already has subtitles unless `?replace=1`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "mutation");
  if (limited) return limited;
  const language = request.nextUrl.searchParams.get("language") ?? getSetting(getDb(), "subtitle_language") ?? DEFAULT_SUBTITLE_LANGUAGE;
  if (!isSubtitleLanguage(language)) {
    return Response.json({ error: "language must be en or pl" }, { status: 400 });
  }
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

  const result = await fetchMovieSubtitles(getDb(), movieId, {
    language,
    replace: request.nextUrl.searchParams.get("replace") === "1",
  });
  if (!result) {
    return Response.json({ error: "Movie or file path not found" }, { status: 404 });
  }
  // What was just recorded, so the detail can show "last checked" without a reload.
  const check = subtitleCheckFromRow(
    getDb()
      .prepare(
        "SELECT subtitles_checked_at, subtitles_check_status, subtitles_check_detail FROM movies WHERE id = ?",
      )
      .get(movieId) as Record<string, number | string | null>,
  );

  switch (result.status) {
    case "downloaded":
      return Response.json({ ok: true, ...result, check });
    case "exists":
      return Response.json(
        { error: "Movie already has subtitles", ...result, check },
        { status: 409 },
      );
    case "not_found":
      return Response.json(
        { error: `No ${language === "en" ? "English" : "Polish"} subtitles found`, ...result, check },
        { status: 404 },
      );
    case "no_file":
      return Response.json(
        { error: "Movie file not found on disk", ...result, check },
        { status: 404 },
      );
    case "error":
      console.error(
        `[Subtitles] Download failed for movie ${movieId}: ${result.error}`,
      );
      return Response.json({ error: result.error, check }, { status: 500 });
  }
}
