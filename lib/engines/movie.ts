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
    .filter((m) => m.tmdb_id && (m.user_rating ?? 0) >= 7)
    .sort((a, b) => (b.user_rating ?? 0) - (a.user_rating ?? 0))
    .slice(0, 10);

  const recResults = await Promise.allSettled(
    seeds.map((m) => getTmdbRecommendations(m.tmdb_id!)),
  );
  const groups: RecommendationGroup[] = [];
  recResults.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    const filtered = filterResults(result.value, ctx);
    if (filtered.length > 0) {
      groups.push({
        reason: `Because you loved ${seeds[i].title}`,
        type: "movie",
        recommendations: filtered,
      });
    }
  });
  return groups;
}
