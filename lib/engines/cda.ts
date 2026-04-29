import { getDb, getRecommendedMovies, getDismissedIds } from "../db";
import { normalizeTitle, type EngineContext, type RecommendationGroup } from "./index";
import type { TmdbSearchResult } from "../tmdb";

export async function cdaEngine(
  ctx: EngineContext,
): Promise<RecommendationGroup[]> {
  const db = getDb();
  const cdaMovies = getRecommendedMovies(db, "cda");
  const dismissedIds = getDismissedIds(db);

  if (cdaMovies.length === 0) return [];

  // Build user's genre preference scores from library
  const genreScores = new Map<string, number>();
  for (const movie of ctx.library) {
    if (!movie.genre) continue;
    const weight = movie.user_rating ?? 5;
    if (weight < 5) continue;
    for (const g of movie.genre.split(", ")) {
      const genre = g.trim();
      if (genre && genre !== "Unknown") {
        genreScores.set(genre, (genreScores.get(genre) || 0) + weight);
      }
    }
  }

  const libraryTitles = new Set([...ctx.libraryTitles]);

  // Group by TMDb genre, sorted by user preference
  const genreGroups = new Map<string, TmdbSearchResult[]>();

  for (const m of cdaMovies) {
    if (dismissedIds.has(m.tmdb_id)) continue;
    if (ctx.libraryTmdbIds.has(m.tmdb_id)) continue;
    if (libraryTitles.has(normalizeTitle(m.title))) continue;
    if (m.pl_title && libraryTitles.has(normalizeTitle(m.pl_title))) continue;

    const genres = m.genre
      ? m.genre
          .split(", ")
          .map((g) => g.trim())
          .filter(Boolean)
      : ["Other"];

    const primaryGenre = genres[0] || "Other";
    if (!genreGroups.has(primaryGenre)) genreGroups.set(primaryGenre, []);

    genreGroups.get(primaryGenre)!.push({
      title: m.title,
      year: m.year,
      genre: m.genre || "",
      rating: m.rating || 0,
      poster_url: m.poster_url,
      tmdb_id: m.tmdb_id,
      imdb_id: null,
      cda_url: m.cda_url || undefined,
    });
  }

  // Sort genres by user preference
  const sortedGenres = [...genreGroups.keys()].sort((a, b) => {
    const scoreA = genreScores.get(a) || 0;
    const scoreB = genreScores.get(b) || 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.localeCompare(b);
  });

  return sortedGenres
    .filter((genre) => (genreGroups.get(genre)?.length || 0) > 0)
    .map((genre) => ({
      reason: `${genre} on CDA`,
      type: "cda" as const,
      recommendations: genreGroups
        .get(genre)!
        .sort((a, b) => (b.rating || 0) - (a.rating || 0)),
    }));
}
