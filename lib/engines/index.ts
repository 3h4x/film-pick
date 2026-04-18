import type { Movie } from "../db";
import type { TmdbSearchResult } from "../tmdb";
import { genreEngine } from "./genre";
import { directorEngine } from "./director";
import { actorEngine } from "./actor";
import { movieEngine } from "./movie";
import { hiddenGemEngine } from "./hidden-gem";
import { starStuddedEngine } from "./star-studded";
import { randomEngine } from "./random";
import { getDb, getRecommendedMovies } from "../db";
import { cdaEngine } from "./cda";
import { watchlistEngine } from "./watchlist";

export interface RecommendationGroup {
  reason: string;
  type: string;
  recommendations: TmdbSearchResult[];
}

export interface RecConfig {
  excluded_genres: string[];
  min_year: number | null;
  min_rating: number | null;
  max_per_group: number;
}

export interface EngineContext {
  library: Movie[];
  dismissedIds: Set<number>;
  libraryTmdbIds: Set<number>;
  libraryTitles: Set<string>;
  config?: RecConfig;
}

export type RecommendationEngine = (
  ctx: EngineContext,
) => Promise<RecommendationGroup[]>;

export interface EngineDefinition {
  name: string;
  icon: string;
  engine: RecommendationEngine;
  dbBacked?: boolean; // Skip recommendation_cache, reads from recommended_movies directly
  noCache?: boolean; // Always fetch fresh results (never cache)
}

export const engines: Record<string, EngineDefinition> = {
  random: { name: "Surprise Me", icon: "🎲", engine: randomEngine, noCache: true },
  genre: { name: "By Genre", icon: "🎭", engine: genreEngine },
  director: { name: "By Director", icon: "🎬", engine: directorEngine },
  actor: { name: "By Actor", icon: "⭐", engine: actorEngine },
  movie: { name: "Similar", icon: "💡", engine: movieEngine },
  hidden_gem: { name: "Hidden Gems", icon: "💎", engine: hiddenGemEngine },
  star_studded: { name: "Star-Studded", icon: "🌟", engine: starStuddedEngine },
  cda: { name: "On CDA", icon: "📺", engine: cdaEngine, dbBacked: true },
  watchlist: { name: "From Watchlist", icon: "🔖", engine: watchlistEngine },
};

// Build a lookup of CDA URLs by tmdb_id and title
export function getCdaLookup(): {
  byTmdbId: Map<number, string>;
  byTitle: Map<string, string>;
} {
  const db = getDb();
  const cdaMovies = getRecommendedMovies(db, "cda");
  const byTmdbId = new Map<number, string>();
  const byTitle = new Map<string, string>();
  for (const m of cdaMovies) {
    if (m.cda_url) {
      if (m.tmdb_id) byTmdbId.set(m.tmdb_id, m.cda_url);
      byTitle.set(m.title.toLowerCase(), m.cda_url);
      if (m.pl_title) byTitle.set(m.pl_title.toLowerCase(), m.cda_url);
    }
  }
  return { byTmdbId, byTitle };
}

export function enrichWithCda(
  results: TmdbSearchResult[],
  cdaLookup: { byTmdbId: Map<number, string>; byTitle: Map<string, string> },
): TmdbSearchResult[] {
  return results.map((r) => {
    const cdaUrl =
      cdaLookup.byTmdbId.get(r.tmdb_id) ||
      cdaLookup.byTitle.get(r.title.toLowerCase());
    if (cdaUrl) return { ...r, cda_url: cdaUrl };
    return r;
  });
}

export function buildContext(
  library: Movie[],
  dismissedIds: Set<number>,
  config?: RecConfig,
): EngineContext {
  return {
    library,
    dismissedIds,
    libraryTmdbIds: new Set(
      library.map((m) => m.tmdb_id).filter(Boolean) as number[],
    ),
    libraryTitles: new Set(library.map((m) => m.title.toLowerCase())),
    config,
  };
}

export function filterResults(
  results: TmdbSearchResult[],
  ctx: EngineContext,
  seen: Set<number> = new Set(),
): TmdbSearchResult[] {
  const cfg = ctx.config;
  const excludedGenres = cfg?.excluded_genres?.length
    ? new Set(cfg.excluded_genres.map((g) => g.toLowerCase()))
    : null;

  return results.filter((r) => {
    if (ctx.libraryTmdbIds.has(r.tmdb_id)) return false;
    if (ctx.libraryTitles.has(r.title.toLowerCase())) return false;
    if (ctx.dismissedIds.has(r.tmdb_id)) return false;
    if (seen.has(r.tmdb_id)) return false;
    if (cfg?.min_year && r.year && r.year < cfg.min_year) return false;
    if (cfg?.min_rating && r.rating < cfg.min_rating) return false;
    if (excludedGenres && r.genre) {
      const movieGenres = r.genre
        .split(", ")
        .map((g) => g.trim().toLowerCase());
      if (movieGenres.some((g) => excludedGenres.has(g))) return false;
    }
    seen.add(r.tmdb_id);
    return true;
  });
}
