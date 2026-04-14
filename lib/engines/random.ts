import type { EngineContext, RecommendationGroup } from "./index";

export async function randomEngine(
  ctx: EngineContext,
): Promise<RecommendationGroup[]> {
  // Pick random movies from the local library
  const candidates = ctx.library.filter(
    (m) => m.tmdb_id && !ctx.dismissedIds.has(m.tmdb_id),
  );
  if (candidates.length === 0) return [];

  // Fisher-Yates shuffle a copy
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const picks = shuffled.slice(0, 15).map((m) => ({
    tmdb_id: m.tmdb_id!,
    title: m.title,
    year: m.year,
    genre: m.genre ?? "",
    rating: m.rating ?? 0,
    poster_url: m.poster_url,
    imdb_id: m.imdb_id ?? null,
    pl_title: m.pl_title ?? undefined,
  }));

  return [
    {
      reason: "Random surprise — feeling lucky?",
      type: "random",
      recommendations: picks,
    },
  ];
}
