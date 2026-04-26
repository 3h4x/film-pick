import { NextRequest } from "next/server";
import {
  getDb,
  getMovies,
  getDismissedIds,
  getCachedEngine,
  setCachedEngine,
  clearCachedEngine,
  saveRecommendedMovies,
  getRecommendedMovies,
  getSetting,
  insertMovie,
} from "@/lib/db";
import {
  engines,
  buildContext,
  getCdaLookup,
  enrichWithCda,
  type RecommendationGroup,
  type RecConfig,
} from "@/lib/engines";

export async function GET(request: NextRequest) {
  const db = getDb();
  const engineKey = request.nextUrl.searchParams.get("engine") || "all";
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const allMovies = getMovies(db);
  // For recommendation engine context, only count non-recommendation movies (the real library)
  const movies = allMovies.filter((m) => m.source !== "recommendation");
  const movieCount = movies.length;
  const dismissedIds = getDismissedIds(db);
  // Movies the user has rated — these should not appear in recommendations
  const ratedTmdbIds = new Set(
    allMovies
      .filter((m) => m.user_rating != null && m.user_rating > 0 && m.tmdb_id)
      .map((m) => m.tmdb_id as number),
  );
  const cdaLookup = getCdaLookup();
  const configRaw = getSetting(db, "rec_config");
  const config: RecConfig | undefined = configRaw
    ? (() => { try { return JSON.parse(configRaw); } catch { return undefined; } })()
    : undefined;
  const disabledRaw = getSetting(db, "disabled_engines");
  const disabledEngines: string[] = disabledRaw
    ? (() => { try { return JSON.parse(disabledRaw); } catch { return []; } })()
    : [];

  function filterExcluded(
    groups: RecommendationGroup[],
    { skipRated = false }: { skipRated?: boolean } = {},
  ): RecommendationGroup[] {
    return groups
      .map((g) => ({
        ...g,
        recommendations: g.recommendations.filter(
          (r) => !dismissedIds.has(r.tmdb_id) && (skipRated || !ratedTmdbIds.has(r.tmdb_id)),
        ),
      }))
      .filter((g) => g.recommendations.length > 0);
  }

  function enrichFromDb(
    groups: RecommendationGroup[],
    engine: string,
  ): RecommendationGroup[] {
    const dbRows = getRecommendedMovies(db, engine);
    const enrichMap = new Map(dbRows.map((r) => [r.tmdb_id, r]));
    return groups.map((g) => ({
      ...g,
      recommendations: g.recommendations.map((r) => {
        const dbRow = enrichMap.get(r.tmdb_id);
        return dbRow
          ? { ...r, pl_title: dbRow.pl_title, cda_url: dbRow.cda_url }
          : r;
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
      saveRecommendedMovies(
        db,
        group.type,
        group.reason,
        group.recommendations,
      );
      // Store in main movies table — insertMovie dedup prevents duplicates
      for (const rec of group.recommendations) {
        insertMovie(db, {
          title: rec.title,
          year: rec.year,
          genre: rec.genre,
          director: null,
          rating: rec.rating,
          poster_url: rec.poster_url,
          source: "recommendation",
          imdb_id: null,
          tmdb_id: rec.tmdb_id,
          type: "movie",
        });
      }
    }
  }

  async function runEngine(
    key: string,
    def: (typeof engines)[string],
  ): Promise<RecommendationGroup[]> {
    try {
      // DB-backed engines skip cache
      if (def.dbBacked) {
        const ctx = buildContext(movies, dismissedIds, config);
        return addCdaUrls(filterExcluded(await def.engine(ctx)));
      }

      // noCache engines always fetch fresh (e.g. Surprise Me) — don't exclude rated movies
      if (def.noCache) {
        const ctx = buildContext(movies, dismissedIds, config);
        return addCdaUrls(filterExcluded(await def.engine(ctx), { skipRated: true }));
      }

      if (refresh) clearCachedEngine(db, key);

      const cached = getCachedEngine(db, key, movieCount);
      if (cached) {
        return addCdaUrls(
          filterExcluded(enrichFromDb(cached as RecommendationGroup[], key)),
        );
      }

      const ctx = buildContext(movies, dismissedIds, config);
      const groups = await def.engine(ctx);
      setCachedEngine(db, key, groups, movieCount);
      persistResults(groups);
      return addCdaUrls(filterExcluded(groups));
    } catch (err) {
      console.error(`[Recommendations] engine "${key}" failed:`, err);
      return [];
    }
  }

  function applyMaxPerGroup(
    groups: RecommendationGroup[],
  ): RecommendationGroup[] {
    const max = config?.max_per_group ?? 15;
    return groups.map((g) => ({
      ...g,
      recommendations: g.recommendations.slice(0, max),
    }));
  }

  // Single engine request
  if (engineKey !== "all" && engines[engineKey]) {
    if (disabledEngines.includes(engineKey)) {
      return Response.json([]);
    }
    const groups = await runEngine(engineKey, engines[engineKey]);
    return Response.json(applyMaxPerGroup(groups));
  }

  // All engines
  const allGroups: RecommendationGroup[] = [];
  for (const [key, def] of Object.entries(engines)) {
    if (disabledEngines.includes(key)) continue;
    const groups = await runEngine(key, def);
    allGroups.push(...groups);
  }

  return Response.json(applyMaxPerGroup(allGroups));
}
