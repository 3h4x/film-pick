import { NextRequest } from "next/server";
import { searchTmdbForUi } from "@/lib/tmdb";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeSearchQuery } from "@/lib/search";

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, "tmdb");
  if (limited) return limited;
  const query = request.nextUrl.searchParams.get("q") || "";

  if (!query.trim()) {
    return Response.json([]);
  }

  try {
    // Release-style names ("Some.Movie.2019.1080p") are searched as title + year.
    const { title, year } = normalizeSearchQuery(query);
    const results = await searchTmdbForUi(title, year);
    return Response.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    if (message.includes("TMDB_API_KEY not set") || message.includes("tmdb_api_error")) {
      return Response.json({ error: "no_api_key" }, { status: 503 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
