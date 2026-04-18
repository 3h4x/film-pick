import { getTmdbRecommendations } from "../tmdb";
import {
  filterResults,
  type EngineContext,
  type RecommendationGroup,
} from "./index";

export async function watchlistEngine(
  ctx: EngineContext,
): Promise<RecommendationGroup[]> {
  const seeds = ctx.library
    .filter((m) => m.tmdb_id && m.wishlist === 1)
    .slice(0, 8);

  if (seeds.length === 0) return [];

  const recResults = await Promise.allSettled(
    seeds.map((m) => getTmdbRecommendations(m.tmdb_id!)),
  );
  const groups: RecommendationGroup[] = [];
  recResults.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    const filtered = filterResults(result.value, ctx);
    if (filtered.length > 0) {
      groups.push({
        reason: `Because you want to watch "${seeds[i].title}"`,
        type: "watchlist",
        recommendations: filtered,
      });
    }
  });
  return groups;
}
