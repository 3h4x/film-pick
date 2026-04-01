import { discoverByGenre, genreNameToId } from "../tmdb";
import { filterResults, type EngineContext, type RecommendationGroup } from "./index";

export async function genreEngine(ctx: EngineContext): Promise<RecommendationGroup[]> {
  const genreScores = new Map<string, number>();
  for (const movie of ctx.library) {
    if (!movie.genre) continue;
    const weight = (movie as any).user_rating ?? 5;
    if (weight < 5) continue; // exclude disliked
    for (const g of movie.genre.split(", ")) {
      const genre = g.trim();
      if (genre && genre !== "Unknown") {
        genreScores.set(genre, (genreScores.get(genre) || 0) + weight);
      }
    }
  }

  const topGenres = [...genreScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const groups: RecommendationGroup[] = [];
  for (const [genreName] of topGenres) {
    const genreId = genreNameToId(genreName);
    if (!genreId) continue;
    const results = await discoverByGenre(genreId);
    const filtered = filterResults(results, ctx);
    if (filtered.length > 0) {
      groups.push({
        reason: `Because you love ${genreName}`,
        type: "genre",
        recommendations: filtered.slice(0, 15),
      });
    }
  }
  return groups;
}
