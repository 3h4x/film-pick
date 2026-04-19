import {
  getDb,
  getDismissedIds,
  getCachedEngine,
  getRecommendedMovies,
} from "@/lib/db";
import { engines, type RecommendationGroup } from "@/lib/engines";

export async function GET() {
  const db = getDb();
  const dismissedIds = getDismissedIds(db);
  const movieCount = db.prepare("SELECT COUNT(*) as c FROM movies").get() as {
    c: number;
  };
  let total = 0;

  for (const [key, def] of Object.entries(engines)) {
    if (def.dbBacked) {
      // Count from recommended_movies directly
      const rows = getRecommendedMovies(db, key);
      total += rows.filter((r) => !dismissedIds.has(r.tmdb_id)).length;
    } else {
      // Count from cache if available
      const cached = getCachedEngine<RecommendationGroup>(db, key, movieCount.c);
      if (cached) {
        for (const group of cached) {
          total += (group.recommendations || []).filter(
            (r) => !dismissedIds.has(r.tmdb_id),
          ).length;
        }
      }
    }
  }

  return Response.json({ total });
}
