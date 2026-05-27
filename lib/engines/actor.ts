import { discoverByPerson, getMovieCredits } from "../tmdb";
import {
  attachTrace,
  filterResults,
  type EngineContext,
  type RecommendationGroup,
} from "./index";

export async function actorEngine(
  ctx: EngineContext,
): Promise<RecommendationGroup[]> {
  const highRated = ctx.library
    .filter((m) => m.tmdb_id && (m.user_rating ?? 0) >= 7)
    .sort((a, b) => (b.user_rating ?? 0) - (a.user_rating ?? 0))
    .slice(0, 50);

  const actorCounts = new Map<
    number,
    { name: string; count: number; avgRating: number }
  >();

  const creditResults = await Promise.allSettled(
    highRated.map((m) => getMovieCredits(m.tmdb_id!)),
  );
  creditResults.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    const rating = highRated[i].user_rating ?? 7;
    for (const actor of result.value.cast) {
      const existing = actorCounts.get(actor.id);
      if (existing) {
        existing.count++;
        existing.avgRating =
          (existing.avgRating * (existing.count - 1) + rating) /
          existing.count;
      } else {
        actorCounts.set(actor.id, { name: actor.name, count: 1, avgRating: rating });
      }
    }
  });

  const minAppearances = ctx.config?.actor_min_appearances ?? 2;
  const topActors = [...actorCounts.entries()]
    .filter(([, v]) => v.count >= minAppearances || v.avgRating >= 9)
    .map((entry) => ({ entry, score: entry[1].count * entry[1].avgRating }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((x) => x.entry);

  const discoverResults = await Promise.allSettled(
    topActors.map(([id]) => discoverByPerson(id)),
  );
  const groups: RecommendationGroup[] = [];
  discoverResults.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    const [, { name }] = topActors[i];
    const filtered = filterResults(result.value, ctx);
    if (filtered.length > 0) {
      groups.push({
        reason: `Starring ${name}`,
        type: "actor",
        recommendations: attachTrace(filtered.slice(0, 15), {
          engine: "actor",
          seedKind: "actor",
          seedId: topActors[i][0],
          seedName: name,
        }),
      });
    }
  });
  return groups;
}
