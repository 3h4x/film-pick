import { NextRequest } from "next/server";
import { getDb, getMovies, getDismissedIds, getCachedEngine, setCachedEngine, clearCachedEngine, saveRecommendedMovies, getRecommendedMovies } from "@/lib/db";
import { engines, buildContext, getCdaLookup, enrichWithCda, type RecommendationGroup } from "@/lib/engines";

export async function GET(request: NextRequest) {
  const db = getDb();
  const engineKey = request.nextUrl.searchParams.get("engine") || "all";
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const movies = getMovies(db);
  const movieCount = movies.length;
  const dismissedIds = getDismissedIds(db);
  const cdaLookup = getCdaLookup();

  function filterDismissed(groups: RecommendationGroup[]): RecommendationGroup[] {
    return groups
      .map((g) => ({
        ...g,
        recommendations: g.recommendations.filter((r) => !dismissedIds.has(r.tmdb_id)),
      }))
      .filter((g) => g.recommendations.length > 0);
  }

  function enrichFromDb(groups: RecommendationGroup[], engine: string): RecommendationGroup[] {
    const dbRows = getRecommendedMovies(db, engine);
    const enrichMap = new Map(dbRows.map((r) => [r.tmdb_id, r]));
    return groups.map((g) => ({
      ...g,
      recommendations: g.recommendations.map((r: any) => {
        const dbRow = enrichMap.get(r.tmdb_id);
        return dbRow ? { ...r, pl_title: dbRow.pl_title, cda_url: dbRow.cda_url } : r;
      }),
    }));
  }

  function addCdaUrls(groups: RecommendationGroup[]): RecommendationGroup[] {
    return groups.map((g) => ({
      ...g,
      recommendations: enrichWithCda(g.recommendations, cdaLookup),
    }));
  }

  function persistResults(groups: RecommendationGroup[]): void {
    for (const group of groups) {
      saveRecommendedMovies(db, group.type, group.reason, group.recommendations);
    }
  }

  async function runEngine(key: string, def: typeof engines[string]): Promise<RecommendationGroup[]> {
    // DB-backed engines skip cache
    if (def.dbBacked) {
      const ctx = buildContext(movies, dismissedIds);
      return addCdaUrls(await def.engine(ctx));
    }

    if (refresh) clearCachedEngine(db, key);

    const cached = getCachedEngine(db, key, movieCount);
    if (cached) {
      return addCdaUrls(filterDismissed(enrichFromDb(cached as RecommendationGroup[], key)));
    }

    const ctx = buildContext(movies, dismissedIds);
    const groups = await def.engine(ctx);
    setCachedEngine(db, key, groups, movieCount);
    persistResults(groups);
    return addCdaUrls(groups);
  }

  // Single engine request
  if (engineKey !== "all" && engines[engineKey]) {
    const groups = await runEngine(engineKey, engines[engineKey]);
    return Response.json(groups);
  }

  // All engines
  const allGroups: RecommendationGroup[] = [];
  for (const [key, def] of Object.entries(engines)) {
    const groups = await runEngine(key, def);
    allGroups.push(...groups);
  }

  return Response.json(allGroups);
}
