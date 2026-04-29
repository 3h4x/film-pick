import { getDb, getSetting } from "@/lib/db";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_GENRE_MAP: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

// Raw TMDb API response shapes
interface TmdbRawResult {
  id: number;
  title: string;
  release_date: string | null;
  genre_ids: number[];
  vote_average: number;
  poster_path: string | null;
}

interface TmdbRawCrewMember {
  id: number;
  name: string;
  job: string;
  department?: string;
}

interface TmdbRawCastMember {
  id: number;
  name: string;
  character: string;
}

// ── In-memory TTL cache ──────────────────────────────────────────────────────
// Caches per-movie lookups so that rapid repeated opens of the same detail view
// do not re-hit the TMDb API.  Only successful (ok) responses are cached.
// Error responses are not stored so transient failures don't poison the cache.

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const CACHE_TTL_MS = 3_600_000; // 1 hour

type LocalizedResult = { pl_title: string | null; description: string | null };
type DetailsResult = { director: string | null; writer: string | null; actors: string | null };

const localizedCache = new Map<number, CacheEntry<LocalizedResult>>();
const detailsCache = new Map<number, CacheEntry<DetailsResult>>();

function cacheHit<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return entry !== undefined && Date.now() < entry.expiry;
}

/** Clears all in-memory TMDb caches.  Intended for tests only. */
export function clearTmdbCache(): void {
  localizedCache.clear();
  detailsCache.clear();
}

// ─────────────────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.TMDB_API_KEY || getDbApiKey();
  if (!key) throw new Error("TMDB_API_KEY not set — configure in Config tab or run: eval \"$(bioenv load)\"");
  return key;
}

function getDbApiKey(): string | null {
  try {
    const db = getDb();
    return getSetting(db, "tmdb_api_key");
  } catch {
    return null;
  }
}

function genreIdsToString(ids: number[]): string {
  return ids.map((id) => TMDB_GENRE_MAP[id] || "Unknown").join(", ");
}

// Reverse map: genre name → TMDb genre ID
const GENRE_NAME_TO_ID: Record<string, number> = Object.fromEntries(
  Object.entries(TMDB_GENRE_MAP).map(([id, name]) => [name, Number(id)]),
);

export function genreNameToId(name: string): number | null {
  return GENRE_NAME_TO_ID[name] ?? null;
}

function mapResult(r: TmdbRawResult): TmdbSearchResult {
  return {
    title: r.title,
    year: r.release_date ? parseInt(r.release_date.substring(0, 4), 10) : null,
    genre: genreIdsToString(r.genre_ids || []),
    rating: Math.round(r.vote_average * 10) / 10,
    poster_url: r.poster_path
      ? `https://image.tmdb.org/t/p/w300${r.poster_path}`
      : null,
    tmdb_id: r.id,
    imdb_id: null,
  };
}

export interface TmdbSearchResult {
  title: string;
  year: number | null;
  genre: string;
  rating: number;
  poster_url: string | null;
  tmdb_id: number;
  imdb_id: string | null;
  cda_url?: string | null;
  pl_title?: string | null;
}

// Shared pagination helper: fetch a pre-built list of URLs sequentially,
// stopping on the first non-ok response.
async function fetchDiscoverPages(
  urls: string[],
  apiKey: string,
): Promise<TmdbSearchResult[]> {
  const all: TmdbSearchResult[] = [];
  for (const url of urls) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) break;
    const data = (await res.json()) as { results?: TmdbRawResult[] };
    all.push(...(data.results || []).map(mapResult));
  }
  return all;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  apiKey: string,
  retries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 429) {
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.warn(`[TMDb] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await sleep(delay);
        continue;
      }
    }
    return res;
  }
  // Should never reach here, but satisfies TypeScript
  return fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
}

export async function searchTmdb(
  query: string,
  year?: number | null,
): Promise<TmdbSearchResult[]> {
  const apiKey = getApiKey();

  async function searchWithYear(y: number | null | undefined) {
    let url = `${TMDB_BASE}/search/movie?query=${encodeURIComponent(query)}&language=en-US&page=1`;
    if (y) url += `&year=${y}`;
    const res = await fetchWithRetry(url, apiKey);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[TMDb] searchTmdb failed: ${res.status} ${res.statusText}`, body);
      throw new Error(`tmdb_api_error:${res.status}`);
    }
    const data = (await res.json()) as { results?: TmdbRawResult[] };
    return (data.results || []).slice(0, 10).map(mapResult);
  }

  // Try original year first
  let results = await searchWithYear(year);

  // If no match and year is provided, try +/- 1 year and then without year
  if (results.length === 0 && year) {
    results = await searchWithYear(year + 1);
    if (results.length === 0) {
      results = await searchWithYear(year - 1);
    }
    if (results.length === 0) {
      results = await searchWithYear(null);
    }
  }

  return results;
}

export async function getMovieLocalized(
  tmdbId: number,
): Promise<{ pl_title: string | null; description: string | null }> {
  const cached = localizedCache.get(tmdbId);
  if (cacheHit(cached)) return cached.data;

  const apiKey = getApiKey();
  const plRes = await fetchWithRetry(
    `${TMDB_BASE}/movie/${tmdbId}?language=pl-PL`,
    apiKey,
  );
  if (!plRes.ok) return { pl_title: null, description: null };
  const plData = (await plRes.json()) as { title?: string; overview?: string };

  let description = plData.overview || null;
  if (!description) {
    const enRes = await fetchWithRetry(
      `${TMDB_BASE}/movie/${tmdbId}?language=en-US`,
      apiKey,
    );
    if (enRes.ok) {
      const enData = (await enRes.json()) as { overview?: string };
      description = enData.overview || null;
    }
  }

  const result: LocalizedResult = { pl_title: plData.title || null, description };
  localizedCache.set(tmdbId, { data: result, expiry: Date.now() + CACHE_TTL_MS });
  return result;
}

// Keep backward compat
export async function getPolishTitle(tmdbId: number): Promise<string | null> {
  const { pl_title } = await getMovieLocalized(tmdbId);
  return pl_title;
}

export async function getTmdbMovieDetails(
  tmdbId: number,
): Promise<{
  director: string | null;
  writer: string | null;
  actors: string | null;
}> {
  const cached = detailsCache.get(tmdbId);
  if (cacheHit(cached)) return cached.data;

  const url = `${TMDB_BASE}/movie/${tmdbId}?append_to_response=credits`;
  const apiKey = getApiKey();
  const res = await fetchWithRetry(url, apiKey);

  if (!res.ok) return { director: null, writer: null, actors: null };

  const data = (await res.json()) as {
    credits?: {
      crew?: TmdbRawCrewMember[];
      cast?: TmdbRawCastMember[];
    };
  };
  const director =
    data.credits?.crew?.find((c) => c.job === "Director")?.name || null;
  const writer =
    data.credits?.crew
      ?.filter((c) => ["Screenplay", "Writer", "Story"].includes(c.job))
      .map((c) => c.name)
      .join(", ") || null;
  const actors =
    data.credits?.cast
      ?.slice(0, 5)
      .map((c) => c.name)
      .join(", ") || null;

  const result: DetailsResult = { director, writer, actors };
  detailsCache.set(tmdbId, { data: result, expiry: Date.now() + CACHE_TTL_MS });
  return result;
}

export async function getTmdbRecommendations(
  tmdbId: number,
): Promise<TmdbSearchResult[]> {
  const url = `${TMDB_BASE}/movie/${tmdbId}/recommendations?language=en-US&page=1`;
  const apiKey = getApiKey();
  const res = await fetchWithRetry(url, apiKey);

  if (!res.ok) return [];

  const data = (await res.json()) as { results?: TmdbRawResult[] };
  const results = (data.results || []).slice(0, 5);
  return results.map(mapResult);
}

export async function getTmdbSimilar(
  tmdbId: number,
): Promise<TmdbSearchResult[]> {
  const url = `${TMDB_BASE}/movie/${tmdbId}/similar?language=en-US&page=1`;
  const apiKey = getApiKey();
  const res = await fetchWithRetry(url, apiKey);

  if (!res.ok) return [];

  const data = (await res.json()) as { results?: TmdbRawResult[] };
  return (data.results || []).slice(0, 5).map(mapResult);
}

export async function discoverByGenre(
  genreId: number,
  pages = 3,
): Promise<TmdbSearchResult[]> {
  const apiKey = getApiKey();
  const urls = Array.from(
    { length: pages },
    (_, i) =>
      `${TMDB_BASE}/discover/movie?with_genres=${genreId}&sort_by=vote_average.desc&vote_count.gte=500&language=en-US&page=${i + 1}`,
  );
  return fetchDiscoverPages(urls, apiKey);
}

export async function discoverByPerson(
  personId: number,
  pages = 2,
): Promise<TmdbSearchResult[]> {
  const apiKey = getApiKey();
  const urls = Array.from(
    { length: pages },
    (_, i) =>
      `${TMDB_BASE}/discover/movie?with_people=${personId}&sort_by=vote_average.desc&vote_count.gte=50&language=en-US&page=${i + 1}`,
  );
  return fetchDiscoverPages(urls, apiKey);
}

export interface TmdbCredit {
  id: number;
  name: string;
  job?: string;
  character?: string;
  department?: string;
}

export async function discoverHiddenGems(
  genreId?: number,
): Promise<TmdbSearchResult[]> {
  const apiKey = getApiKey();
  const urls = Array.from({ length: 3 }, () => {
    const page = Math.floor(Math.random() * 10) + 1;
    let url = `${TMDB_BASE}/discover/movie?sort_by=vote_average.desc&vote_count.gte=50&vote_count.lte=500&vote_average.gte=7.5&language=en-US&page=${page}`;
    if (genreId) url += `&with_genres=${genreId}`;
    return url;
  });
  return fetchDiscoverPages(urls, apiKey);
}

export async function discoverStarStudded(): Promise<TmdbSearchResult[]> {
  const apiKey = getApiKey();
  const urls = Array.from(
    { length: 3 },
    (_, i) =>
      `${TMDB_BASE}/discover/movie?sort_by=popularity.desc&vote_count.gte=5000&vote_average.gte=7&language=en-US&page=${i + 1}`,
  );
  return fetchDiscoverPages(urls, apiKey);
}

export async function discoverRandom(): Promise<TmdbSearchResult[]> {
  const apiKey = getApiKey();
  const urls = Array.from({ length: 3 }, () => {
    const page = Math.floor(Math.random() * 20) + 1;
    return `${TMDB_BASE}/discover/movie?sort_by=popularity.desc&vote_count.gte=200&vote_average.gte=6.5&language=en-US&page=${page}`;
  });
  return shuffle(await fetchDiscoverPages(urls, apiKey));
}

export interface MoodDiscoverParams {
  genreIds?: number[];
  minRating?: number;
  minVotes?: number;
  maxRuntime?: number;
  languages?: string[];
  pages?: number;
}

export async function discoverByMood(
  params: MoodDiscoverParams,
): Promise<TmdbSearchResult[]> {
  const apiKey = getApiKey();
  const {
    genreIds,
    minRating = 6.5,
    minVotes = 200,
    maxRuntime,
    languages,
    pages = 3,
  } = params;

  function buildUrl(page: number, lang?: string): string {
    let url = `${TMDB_BASE}/discover/movie?sort_by=vote_average.desc&vote_count.gte=${minVotes}&vote_average.gte=${minRating}&language=en-US&page=${page}`;
    if (genreIds?.length) url += `&with_genres=${genreIds.join(",")}`;
    if (maxRuntime) url += `&with_runtime.lte=${maxRuntime}`;
    if (lang) url += `&with_original_language=${lang}`;
    return url;
  }

  if (languages?.length) {
    const all: TmdbSearchResult[] = [];
    for (const lang of languages) {
      const urls = Array.from({ length: pages }, (_, i) =>
        buildUrl(i + 1, lang),
      );
      all.push(...(await fetchDiscoverPages(urls, apiKey)));
    }
    return shuffle(all);
  }

  const urls = Array.from({ length: pages }, (_, i) => buildUrl(i + 1));
  return shuffle(await fetchDiscoverPages(urls, apiKey));
}

// Searches TMDb in Polish and returns data needed for CDA enrichment.
// Returns null if no API key is configured or no match is found.
export async function searchTmdbPl(
  title: string,
  year: number | null,
): Promise<{ tmdb_id: number; genre: string; rating: number; description: string | null; poster_url: string | null } | null> {
  let apiKey: string;
  try {
    apiKey = getApiKey();
  } catch {
    return null;
  }

  interface PlRawResult {
    id: number;
    genre_ids: number[];
    vote_average: number;
    overview: string | null;
    poster_path: string | null;
  }

  async function searchWithYear(y: number | null) {
    let url = `${TMDB_BASE}/search/movie?query=${encodeURIComponent(title)}&language=pl-PL&page=1`;
    if (y) url += `&year=${y}`;
    const res = await fetchWithRetry(url, apiKey);
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: PlRawResult[] };
    return data.results ?? null;
  }

  let results = await searchWithYear(year);
  if ((!results || !results.length) && year) {
    results = await searchWithYear(year + 1);
    if (!results || !results.length) results = await searchWithYear(year - 1);
  }
  if (!results || !results.length) results = await searchWithYear(null);

  const match = results?.[0];
  if (!match) return null;

  // Polish-language search may return poster_path: null even when an English poster exists.
  // Fall back to the language-neutral movie details endpoint to get the primary poster.
  let posterPath = match.poster_path;
  if (!posterPath) {
    const detailRes = await fetchWithRetry(`${TMDB_BASE}/movie/${match.id}`, apiKey);
    if (detailRes.ok) {
      const detail = (await detailRes.json()) as { poster_path?: string | null };
      posterPath = detail.poster_path || null;
    }
  }

  return {
    tmdb_id: match.id,
    genre: (match.genre_ids || []).map((id) => TMDB_GENRE_MAP[id] || "Unknown").join(", "),
    rating: Math.round(match.vote_average * 10) / 10,
    description: match.overview || null,
    poster_url: posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : null,
  };
}

export async function getMovieCredits(
  tmdbId: number,
): Promise<{ directors: TmdbCredit[]; cast: TmdbCredit[] }> {
  const url = `${TMDB_BASE}/movie/${tmdbId}/credits`;
  const apiKey = getApiKey();
  const res = await fetchWithRetry(url, apiKey);
  if (!res.ok) return { directors: [], cast: [] };
  const data = (await res.json()) as {
    crew?: TmdbRawCrewMember[];
    cast?: TmdbRawCastMember[];
  };
  const directors = (data.crew || [])
    .filter((c) => c.job === "Director")
    .map((c) => ({ id: c.id, name: c.name, job: c.job }));
  const cast = (data.cast || [])
    .slice(0, 5)
    .map((c) => ({ id: c.id, name: c.name, character: c.character }));
  return { directors, cast };
}
