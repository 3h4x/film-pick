import { discoverRandom } from "../tmdb";
import { filterResults, type EngineContext, type RecommendationGroup } from "./index";

export async function randomEngine(ctx: EngineContext): Promise<RecommendationGroup[]> {
  const random = await discoverRandom();
  const filtered = filterResults(random, ctx);
  if (filtered.length === 0) return [];

  return [{
    reason: "Random surprise — feeling lucky?",
    type: "random",
    recommendations: filtered.slice(0, 15),
  }];
}
