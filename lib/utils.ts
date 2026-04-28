export function cleanTitle(title: string): string {
  return title
    .replace(/\.[^.]+$/, "") // Remove extension if present
    .replace(/\[.*?\]/g, " ") // Remove everything in brackets
    .replace(/\{.*?\}/g, " ") // Remove everything in curly braces
    .replace(
      /\b(720p|1080p|2160p|4k|uhd|bluray|blu-ray|brrip|bdrip|webrip|web-dl|hdtv|dvdrip|xvid|divx|x264|x265|h264|h265|hevc|aac|ac3|dts|remux|proper|repack|maxspeed|torentz|torrentz|3xforum|fxg|noir|flixflux|kingdom|galaxyrg|yify|fgt|psig|yts|ev|evo|hdrip|cd[1-2]|dvd|blurayrip)\b/gi,
      " ",
    )
    .replace(
      /\b(www|ro|com|net|org|pl|uk|co|osloskop|unseen|shoket|fxg|english|polish|multi|dual|subs)\b/gi,
      " ",
    )
    .replace(/[\.\s_-]+/g, " ")
    .replace(/[:;!?()[\]{}]/g, " ") // Remove common punctuation
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .replace(/[\s\-\.]+$/, "")
    .trim();
}

export function parseFilename(filename: string): {
  title: string;
  year: number | null;
} {
  // Remove extension
  let name = filename.replace(/\.[^.]+$/, "");

  // Try to extract year in parentheses at beginning: "(2013) Movie Name"
  let year: number | null = null;
  const startParenYear = name.match(/^\((\d{4})\)/);
  if (startParenYear) {
    const y = parseInt(startParenYear[1], 10);
    if (y >= 1900 && y <= 2099) {
      year = y;
      name = name.replace(/^\(\d{4}\)/, "");
    }
  }

  // Try to extract year in brackets: "[2010]"
  if (!year) {
    const bracketYear = name.match(/\[(\d{4})\]/);
    if (bracketYear) {
      const y = parseInt(bracketYear[1], 10);
      if (y >= 1900 && y <= 2099) {
        year = y;
        name = name.replace(/\[\d{4}\]/, "");
      }
    }
  }

  // Try to extract year in parentheses elsewhere: "Movie Name (2020)"
  if (!year) {
    const parenYear = name.match(/\((\d{4})\)/);
    if (parenYear) {
      const y = parseInt(parenYear[1], 10);
      if (y >= 1900 && y <= 2099) {
        year = y;
        name = name.replace(/\(\d{4}\)/, "");
      }
    }
  }

  // Try to extract year without parens: "Movie Name 2020" or "Movie.Name.2020"
  // ONLY if it's followed by a known tag or end of string, to avoid cutting names like "13 Tzameti" or "One Eight Seven"
  if (!year) {
    const bareYear = name.match(/(?:^|[\.\s_-])(\d{4})(?:[\.\s_-]|$)/);
    if (bareYear) {
      const y = parseInt(bareYear[1], 10);
      if (y >= 1900 && y <= 2099) {
        // Look ahead for known release tags or end of string
        const remaining = name
          .substring(bareYear.index! + bareYear[0].length)
          .toLowerCase();
        const hasTag =
          /\b(720p|1080p|2160p|bluray|dvdrip|xvid|webrip|web-dl|hdtv|x264|x265|aac|ac3)\b/i.test(
            remaining,
          );
        const isEnd = remaining.trim().length === 0;

        if (hasTag || isEnd) {
          year = y;
          const match = bareYear[0];
          const index = name.indexOf(match);
          name = name.substring(0, index);
        }
      }
    }
  }

  // Replace dots/underscores with spaces before cleaning (extension already removed)
  name = name.replace(/[\._]+/g, " ");
  // Clean up common release tags
  name = cleanTitle(name);

  return { title: name, year };
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import type { Movie, SortOption } from "@/lib/types";
import type { RecommendationGroup } from "@/lib/types";
import type { TmdbSearchResult } from "@/lib/tmdb";

export interface MovieFilters {
  searchQuery?: string;
  genreFilter?: string;
  sourceFilter?: string;
  yearFilter?: string;
  unratedOnly?: boolean;
  hasFileOnly?: boolean;
}

export function filterMovies(movies: Movie[], filters: MovieFilters): Movie[] {
  let filtered = movies.filter(
    (m) =>
      m.source !== "recommendation" ||
      (m.user_rating != null && (m.user_rating as number) > 0),
  );
  const { searchQuery, genreFilter, sourceFilter, yearFilter, unratedOnly, hasFileOnly } =
    filters;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.pl_title?.toLowerCase().includes(q),
    );
  }
  if (genreFilter)
    filtered = filtered.filter((m) => m.genre?.includes(genreFilter));
  if (sourceFilter) filtered = filtered.filter((m) => m.source === sourceFilter);
  if (yearFilter)
    filtered = filtered.filter((m) => m.year?.toString() === yearFilter);
  if (unratedOnly)
    filtered = filtered.filter((m) => !m.user_rating || m.user_rating === 0);
  if (hasFileOnly)
    filtered = filtered.filter((m) => !!m.file_path);
  return filtered;
}

export function sortMovies(
  movies: Movie[],
  sort: SortOption,
  sortDir: "asc" | "desc",
): Movie[] {
  const dir = sortDir === "desc" ? -1 : 1;
  return [...movies].sort((a, b) => {
    switch (sort) {
      case "user_rating":
        return dir * ((a.user_rating ?? -1) - (b.user_rating ?? -1));
      case "rating":
        return dir * ((a.rating ?? 0) - (b.rating ?? 0));
      case "year":
        return dir * ((a.year ?? 0) - (b.year ?? 0));
      case "title":
        return dir * a.title.localeCompare(b.title);
      case "created_at":
        return dir * a.created_at.localeCompare(b.created_at);
      case "rated_at":
        return dir * (a.rated_at ?? "").localeCompare(b.rated_at ?? "");
      default:
        return 0;
    }
  });
}

export function extractGenres(movies: Movie[]): string[] {
  const all = new Set<string>();
  movies.forEach((m) => {
    if (m.genre) m.genre.split(", ").forEach((g) => all.add(g.trim()));
  });
  return Array.from(all).sort();
}

export function extractSources(movies: Movie[]): string[] {
  const all = new Set<string>();
  movies.forEach((m) => {
    if (m.source) all.add(m.source);
  });
  return Array.from(all).sort();
}

export function extractYears(movies: Movie[]): number[] {
  const all = new Set<number>();
  movies.forEach((m) => {
    if (m.year) all.add(m.year);
  });
  return Array.from(all).sort((a, b) => b - a);
}

export function filterRatedRecommendations(
  groups: RecommendationGroup[],
  ratedTmdbIds: Set<number | null | undefined>,
  skipFilter = false,
): RecommendationGroup[] {
  return groups
    .map((g) => ({
      ...g,
      recommendations: skipFilter
        ? g.recommendations
        : g.recommendations.filter((r) => !ratedTmdbIds.has(r.tmdb_id)),
    }))
    .filter((g) => g.recommendations.length > 0);
}

export function deduplicateRecommendations(
  groups: RecommendationGroup[],
): RecommendationGroup[] {
  const seen = new Set<number>();
  return groups
    .map((g) => ({
      ...g,
      recommendations: g.recommendations.filter((r: TmdbSearchResult) => {
        if (seen.has(r.tmdb_id)) return false;
        seen.add(r.tmdb_id);
        return true;
      }),
    }))
    .filter((g) => g.recommendations.length > 0);
}
