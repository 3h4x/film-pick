import { discoverHiddenGems, genreNameToId } from "../tmdb";
import { filterResults, type EngineContext, type RecommendationGroup } from "./index";

export async function hiddenGemEngine(ctx: EngineContext): Promise<RecommendationGroup[]> {
  // Find top genre for targeted gems
  const genreScores = new Map<string, number>();
  for (const movie of ctx.library) {
    if (!movie.genre) continue;
    const weight = (movie as any).user_rating ?? 5;
    if (weight < 5) continue;
    for (const g of movie.genre.split(", ")) {
      const genre = g.trim();
      if (genre && genre !== "Unknown") {
        genreScores.set(genre, (genreScores.get(genre) || 0) + weight);
      }
    }
  }

  const topGenre = [...genreScores.entries()].sort((a, b) => b[1] - a[1])[0];
  const genreId = topGenre ? genreNameToId(topGenre[0]) : null;

  const gems = await discoverHiddenGems(genreId ?? undefined);
  const filtered = filterResults(gems, ctx);
  if (filtered.length === 0) return [];

  return [{
    reason: topGenre ? `Hidden ${topGenre[0]} gems` : "Hidden gems you might have missed",
    type: "hidden_gem",
    recommendations: filtered.slice(0, 15),
  }];
}
