import { getDb, getDismissedRecommendations } from "@/lib/db";

/**
 * Films dismissed from recommendations ("not interested" — and every other
 * recommendation action, which also dismisses) and series marked "not interested",
 * with title and year so other tools can match them by name. `media_type` is "movie"
 * or "tv": TMDb numbers the two separately, so a tmdb_id alone is ambiguous.
 * Read by tpb.infraport.io to badge torrents.
 */
export async function GET() {
  try {
    return Response.json(getDismissedRecommendations(getDb()), {
      headers: { "Cache-Control": "private, no-cache" },
    });
  } catch (error) {
    console.error("[recommendations.dismissed] Failed to list dismissed recommendations", error);
    return Response.json({ error: "Failed to list dismissed recommendations" }, { status: 500 });
  }
}
