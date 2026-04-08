import { getTmdbRecommendations } from "../tmdb";
import {
  filterResults,
  type EngineContext,
  type RecommendationGroup,
} from "./index";

export async function movieEngine(
  ctx: EngineContext,
): Promise<RecommendationGroup[]> {
  const seeds = ctx.library
    .filter((m) => m.tmdb_id && ((m as any).user_rating ?? 0) >= 7)
    .sort(
      (a, b) => ((b as any).user_rating ?? 0) - ((a as any).user_rating ?? 0),
    )
    .slice(0, 10);

  const groups: RecommendationGroup[] = [];
  for (const movie of seeds) {
    const recs = await getTmdbRecommendations(movie.tmdb_id!);
    const filtered = filterResults(recs, ctx);
    if (filtered.length > 0) {
      groups.push({
        reason: `Because you loved ${movie.title}`,
        type: "movie",
        recommendations: filtered,
      });
    }
  }
  return groups;
}
