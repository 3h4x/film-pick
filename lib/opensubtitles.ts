import fs from "fs/promises";

// OpenSubtitles REST API v1. Needs OPENSUBTITLES_API_KEY (free, from an account
// on opensubtitles.com); OPENSUBTITLES_USERNAME/PASSWORD raise the daily
// download quota. All three come from the environment (bioenv), never the DB.
const API_BASE = "https://api.opensubtitles.com/api/v1";
const USER_AGENT = "FilmPick v1.0";
const TIMEOUT_MS = 20000;
const CHUNK = 64 * 1024;
const UINT64 = (BigInt(1) << BigInt(64)) - BigInt(1);

export function isOpenSubtitlesConfigured(): boolean {
  return Boolean(process.env.OPENSUBTITLES_API_KEY);
}

/**
 * The OpenSubtitles "moviehash": file size plus the 64-bit little-endian words
 * of the first and last 64 KiB, wrapped to 64 bits. Null for files too small to
 * have two distinct chunks.
 */
export async function opensubtitlesHash(
  filePath: string,
): Promise<string | null> {
  const handle = await fs.open(filePath, "r");
  try {
    const { size } = await handle.stat();
    if (size < CHUNK * 2) return null;
    let sum = BigInt(size);
    for (const position of [0, size - CHUNK]) {
      const buffer = Buffer.alloc(CHUNK);
      await handle.read(buffer, 0, CHUNK, position);
      for (let offset = 0; offset < CHUNK; offset += 8) {
        sum = (sum + buffer.readBigUInt64LE(offset)) & UINT64;
      }
    }
    return sum.toString(16).padStart(16, "0");
  } finally {
    await handle.close();
  }
}

interface SearchResult {
  attributes: {
    moviehash_match?: boolean;
    download_count?: number;
    ai_translated?: boolean;
    machine_translated?: boolean;
    files?: { file_id: number }[];
  };
}

let session: { token: string; baseUrl: string } | null = null;

export function _resetOpenSubtitlesSessionForTests() {
  session = null;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Api-Key": process.env.OPENSUBTITLES_API_KEY ?? "",
    "User-Agent": USER_AGENT,
    Accept: "application/json",
    ...extra,
  };
}

async function login(): Promise<{ token: string; baseUrl: string } | null> {
  const username = process.env.OPENSUBTITLES_USERNAME;
  const password = process.env.OPENSUBTITLES_PASSWORD;
  if (!username || !password) return null;
  if (session) return session;
  const res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`OpenSubtitles login HTTP ${res.status}`);
  const data = (await res.json()) as { token?: string; base_url?: string };
  if (!data.token) return null;
  session = {
    token: data.token,
    // Logged-in accounts may be pinned to another host (e.g. VIP).
    baseUrl: data.base_url ? `https://${data.base_url}/api/v1` : API_BASE,
  };
  return session;
}

/** Hash matches first (timed to this exact file), then human over machine translations, then popularity. */
function rank(a: SearchResult, b: SearchResult): number {
  const score = (r: SearchResult) =>
    (r.attributes.moviehash_match ? 2 : 0) +
    (r.attributes.ai_translated || r.attributes.machine_translated ? 0 : 1);
  return (
    score(b) - score(a) ||
    (b.attributes.download_count ?? 0) - (a.attributes.download_count ?? 0)
  );
}

export interface OpenSubtitlesHit {
  content: Buffer;
  hashMatch: boolean;
}

export async function fetchOpenSubtitlesSubtitle({
  hash,
  imdbId,
  tmdbId,
  query,
  year,
  language = "pl",
}: {
  hash: string | null;
  imdbId?: string | null;
  tmdbId?: number | null;
  query?: string | null;
  year?: number | null;
  language?: string;
}): Promise<OpenSubtitlesHit | null> {
  if (!isOpenSubtitlesConfigured()) return null;

  // The API redirects unless parameters are lowercase and alphabetically sorted.
  const params: Record<string, string> = { languages: language };
  const imdbNumber = imdbId?.replace(/^tt0*/i, "");
  if (imdbNumber) params.imdb_id = imdbNumber;
  else if (tmdbId) params.tmdb_id = String(tmdbId);
  else if (query) {
    params.query = query.toLowerCase();
    if (year) params.year = String(year);
  }
  if (hash) params.moviehash = hash;
  if (!params.imdb_id && !params.tmdb_id && !params.query && !params.moviehash) {
    return null;
  }
  const search = new URLSearchParams(
    Object.keys(params)
      .sort()
      .map((key) => [key, params[key]]),
  );

  const auth = await login();
  const base = auth?.baseUrl ?? API_BASE;
  const res = await fetch(`${base}/subtitles?${search}`, {
    headers: headers(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`OpenSubtitles search HTTP ${res.status}`);
  const { data = [] } = (await res.json()) as { data?: SearchResult[] };
  const best = data
    .filter((r) => r.attributes.files?.length)
    .sort(rank)[0];
  if (!best) return null;

  const download = await fetch(`${base}/download`, {
    method: "POST",
    headers: headers({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth.token}` } : {}),
    }),
    body: JSON.stringify({ file_id: best.attributes.files![0].file_id }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!download.ok) {
    throw new Error(`OpenSubtitles download HTTP ${download.status}`);
  }
  const { link } = (await download.json()) as { link?: string };
  if (!link) return null;
  const file = await fetch(link, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!file.ok) throw new Error(`OpenSubtitles file HTTP ${file.status}`);
  const content = Buffer.from(await file.arrayBuffer());
  return content.length > 0
    ? { content, hashMatch: Boolean(best.attributes.moviehash_match) }
    : null;
}
