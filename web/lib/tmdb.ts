const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_GENRE_MAP: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie",
  53: "Thriller", 10752: "War", 37: "Western",
};

function getApiKey(): string {
  return process.env.TMDB_API_KEY || "";
}

function genreIdsToString(ids: number[]): string {
  return ids.map((id) => TMDB_GENRE_MAP[id] || "Unknown").join(", ");
}

// Reverse map: genre name → TMDb genre ID
const GENRE_NAME_TO_ID: Record<string, number> = Object.fromEntries(
  Object.entries(TMDB_GENRE_MAP).map(([id, name]) => [name, Number(id)])
);

export function genreNameToId(name: string): number | null {
  return GENRE_NAME_TO_ID[name] ?? null;
}

function mapResult(r: any): TmdbSearchResult {
  return {
    title: r.title,
    year: r.release_date ? parseInt(r.release_date.substring(0, 4), 10) : null,
    genre: genreIdsToString(r.genre_ids || []),
    rating: Math.round(r.vote_average * 10) / 10,
    poster_url: r.poster_path ? `https://image.tmdb.org/t/p/w300${r.poster_path}` : null,
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
  cda_url?: string;
}

export async function searchTmdb(query: string): Promise<TmdbSearchResult[]> {
  const url = `${TMDB_BASE}/search/movie?query=${encodeURIComponent(query)}&language=en-US&page=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getApiKey()}` },
  });

  if (!res.ok) return [];

  const data = await res.json();
  return (data.results || []).slice(0, 10).map(mapResult);
}

export async function getMovieLocalized(tmdbId: number): Promise<{ pl_title: string | null; description: string | null }> {
  const url = `${TMDB_BASE}/movie/${tmdbId}?language=pl-PL`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getApiKey()}` } });
  if (!res.ok) return { pl_title: null, description: null };
  const data = await res.json();
  return {
    pl_title: data.title || null,
    description: data.overview || null,
  };
}

// Keep backward compat
export async function getPolishTitle(tmdbId: number): Promise<string | null> {
  const { pl_title } = await getMovieLocalized(tmdbId);
  return pl_title;
}

export async function getTmdbMovieDetails(
  tmdbId: number
): Promise<{ director: string | null }> {
  const url = `${TMDB_BASE}/movie/${tmdbId}?append_to_response=credits`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getApiKey()}` },
  });

  if (!res.ok) return { director: null };

  const data = await res.json();
  const director =
    data.credits?.crew?.find((c: any) => c.job === "Director")?.name || null;
  return { director };
}

export async function getTmdbRecommendations(
  tmdbId: number
): Promise<TmdbSearchResult[]> {
  const url = `${TMDB_BASE}/movie/${tmdbId}/recommendations?language=en-US&page=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getApiKey()}` },
  });

  if (!res.ok) return [];

  const data = await res.json();
  const results = (data.results || []).slice(0, 5);
  return results.map(mapResult);
}

export async function discoverByGenre(genreId: number, pages = 3): Promise<TmdbSearchResult[]> {
  const all: TmdbSearchResult[] = [];
  for (let page = 1; page <= pages; page++) {
    const url = `${TMDB_BASE}/discover/movie?with_genres=${genreId}&sort_by=vote_average.desc&vote_count.gte=500&language=en-US&page=${page}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${getApiKey()}` } });
    if (!res.ok) break;
    const data = await res.json();
    all.push(...(data.results || []).map(mapResult));
  }
  return all;
}

export async function discoverByPerson(personId: number, pages = 2): Promise<TmdbSearchResult[]> {
  const all: TmdbSearchResult[] = [];
  for (let page = 1; page <= pages; page++) {
    const url = `${TMDB_BASE}/discover/movie?with_people=${personId}&sort_by=vote_average.desc&vote_count.gte=50&language=en-US&page=${page}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${getApiKey()}` } });
    if (!res.ok) break;
    const data = await res.json();
    all.push(...(data.results || []).map(mapResult));
  }
  return all;
}

export interface TmdbCredit {
  id: number;
  name: string;
  job?: string;
  character?: string;
  department?: string;
}

export async function discoverHiddenGems(genreId?: number): Promise<TmdbSearchResult[]> {
  const all: TmdbSearchResult[] = [];
  for (let p = 0; p < 3; p++) {
    const page = Math.floor(Math.random() * 10) + 1;
    let url = `${TMDB_BASE}/discover/movie?sort_by=vote_average.desc&vote_count.gte=50&vote_count.lte=500&vote_average.gte=7.5&language=en-US&page=${page}`;
    if (genreId) url += `&with_genres=${genreId}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${getApiKey()}` } });
    if (!res.ok) break;
    const data = await res.json();
    all.push(...(data.results || []).map(mapResult));
  }
  return all;
}

export async function discoverStarStudded(): Promise<TmdbSearchResult[]> {
  const all: TmdbSearchResult[] = [];
  for (let page = 1; page <= 3; page++) {
    const url = `${TMDB_BASE}/discover/movie?sort_by=popularity.desc&vote_count.gte=5000&vote_average.gte=7&language=en-US&page=${page}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${getApiKey()}` } });
    if (!res.ok) break;
    const data = await res.json();
    all.push(...(data.results || []).map(mapResult));
  }
  return all;
}

export async function discoverRandom(): Promise<TmdbSearchResult[]> {
  const all: TmdbSearchResult[] = [];
  for (let i = 0; i < 3; i++) {
    const page = Math.floor(Math.random() * 20) + 1;
    const url = `${TMDB_BASE}/discover/movie?sort_by=popularity.desc&vote_count.gte=200&vote_average.gte=6.5&language=en-US&page=${page}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${getApiKey()}` } });
    if (!res.ok) break;
    const data = await res.json();
    all.push(...(data.results || []).map(mapResult));
  }
  // Shuffle
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

export async function getMovieCredits(tmdbId: number): Promise<{ directors: TmdbCredit[]; cast: TmdbCredit[] }> {
  const url = `${TMDB_BASE}/movie/${tmdbId}/credits`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getApiKey()}` },
  });
  if (!res.ok) return { directors: [], cast: [] };
  const data = await res.json();
  const directors = (data.crew || [])
    .filter((c: any) => c.job === "Director")
    .map((c: any) => ({ id: c.id, name: c.name, job: c.job }));
  const cast = (data.cast || [])
    .slice(0, 5)
    .map((c: any) => ({ id: c.id, name: c.name, character: c.character }));
  return { directors, cast };
}
