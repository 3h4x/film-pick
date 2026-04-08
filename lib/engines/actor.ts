import { discoverByPerson, getMovieCredits } from "../tmdb";
import {
  filterResults,
  type EngineContext,
  type RecommendationGroup,
} from "./index";

export async function actorEngine(
  ctx: EngineContext,
): Promise<RecommendationGroup[]> {
  const highRated = ctx.library
    .filter((m) => m.tmdb_id && ((m as any).user_rating ?? 0) >= 7)
    .sort(
      (a, b) => ((b as any).user_rating ?? 0) - ((a as any).user_rating ?? 0),
    )
    .slice(0, 50);

  const actorCounts = new Map<
    number,
    { name: string; count: number; avgRating: number }
  >();

  for (const movie of highRated) {
    try {
      const credits = await getMovieCredits(movie.tmdb_id!);
      for (const actor of credits.cast) {
        const existing = actorCounts.get(actor.id);
        const rating = (movie as any).user_rating ?? 7;
        if (existing) {
          existing.count++;
          existing.avgRating =
            (existing.avgRating * (existing.count - 1) + rating) /
            existing.count;
        } else {
          actorCounts.set(actor.id, {
            name: actor.name,
            count: 1,
            avgRating: rating,
          });
        }
      }
    } catch {}
  }

  const topActors = [...actorCounts.entries()]
    .filter(([, v]) => v.count >= 3 || (v.count >= 2 && v.avgRating >= 8))
    .sort((a, b) => b[1].count * b[1].avgRating - a[1].count * a[1].avgRating)
    .slice(0, 10);

  const groups: RecommendationGroup[] = [];
  for (const [id, { name }] of topActors) {
    const results = await discoverByPerson(id);
    const filtered = filterResults(results, ctx);
    if (filtered.length > 0) {
      groups.push({
        reason: `Starring ${name}`,
        type: "actor",
        recommendations: filtered.slice(0, 15),
      });
    }
  }
  return groups;
}
