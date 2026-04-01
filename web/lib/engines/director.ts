import { discoverByPerson, getMovieCredits } from "../tmdb";
import { filterResults, type EngineContext, type RecommendationGroup } from "./index";

export async function directorEngine(ctx: EngineContext): Promise<RecommendationGroup[]> {
  // Check top-rated movies for recurring directors
  const highRated = ctx.library
    .filter((m) => m.tmdb_id && ((m as any).user_rating ?? 0) >= 7)
    .sort((a, b) => ((b as any).user_rating ?? 0) - ((a as any).user_rating ?? 0))
    .slice(0, 50);

  const directorCounts = new Map<number, { name: string; count: number; avgRating: number }>();

  for (const movie of highRated) {
    try {
      const credits = await getMovieCredits(movie.tmdb_id!);
      for (const dir of credits.directors) {
        const existing = directorCounts.get(dir.id);
        const rating = (movie as any).user_rating ?? 7;
        if (existing) {
          existing.count++;
          existing.avgRating = (existing.avgRating * (existing.count - 1) + rating) / existing.count;
        } else {
          directorCounts.set(dir.id, { name: dir.name, count: 1, avgRating: rating });
        }
      }
    } catch {}
  }

  // Directors with 2+ films, or 1 film rated 9+
  const topDirectors = [...directorCounts.entries()]
    .filter(([, v]) => v.count >= 2 || v.avgRating >= 9)
    .sort((a, b) => b[1].count * b[1].avgRating - a[1].count * a[1].avgRating)
    .slice(0, 8);

  const groups: RecommendationGroup[] = [];
  for (const [id, { name }] of topDirectors) {
    const results = await discoverByPerson(id);
    const filtered = filterResults(results, ctx);
    if (filtered.length > 0) {
      groups.push({
        reason: `More from director ${name}`,
        type: "director",
        recommendations: filtered.slice(0, 15),
      });
    }
  }
  return groups;
}
