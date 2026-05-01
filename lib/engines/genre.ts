import { discoverByGenre, genreNameToId } from "../tmdb";
import {
  filterResults,
  type EngineContext,
  type RecommendationGroup,
} from "./index";

export async function genreEngine(
  ctx: EngineContext,
): Promise<RecommendationGroup[]> {
  const excludedGenres = new Set(
    (ctx.config?.excluded_genres ?? []).map((g) => g.toLowerCase()),
  );

  const genreScores = new Map<string, number>();

  // Score only from movies the user actually liked (rated >= 7)
  for (const movie of ctx.library) {
    if (!movie.genre || !movie.user_rating || movie.user_rating < 7) continue;
    for (const g of movie.genre.split(", ")) {
      const genre = g.trim();
      if (!genre || genre === "Unknown") continue;
      if (excludedGenres.has(genre.toLowerCase())) continue;
      genreScores.set(genre, (genreScores.get(genre) || 0) + movie.user_rating);
    }
  }

  // Fallback 1: if no movies rated >= 7, use rated movies >= 5
  if (genreScores.size === 0) {
    for (const movie of ctx.library) {
      if (!movie.genre || !movie.user_rating || movie.user_rating < 5) continue;
      for (const g of movie.genre.split(", ")) {
        const genre = g.trim();
        if (!genre || genre === "Unknown") continue;
        if (excludedGenres.has(genre.toLowerCase())) continue;
        genreScores.set(genre, (genreScores.get(genre) || 0) + movie.user_rating);
      }
    }
  }

  // Fallback 2: no explicit ratings at all — include all movies with neutral weight (fresh library)
  if (genreScores.size === 0) {
    for (const movie of ctx.library) {
      if (!movie.genre) continue;
      const weight = (!movie.user_rating || movie.user_rating === 0) ? 3 : 0;
      if (weight === 0) continue;
      for (const g of movie.genre.split(", ")) {
        const genre = g.trim();
        if (!genre || genre === "Unknown") continue;
        if (excludedGenres.has(genre.toLowerCase())) continue;
        genreScores.set(genre, (genreScores.get(genre) || 0) + weight);
      }
    }
  }

  const topCount = ctx.config?.top_genre_count ?? 6;
  const topGenres = [...genreScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topCount);

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
