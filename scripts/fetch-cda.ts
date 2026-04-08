/**
 * Fetch CDA Premium movies and store in recommendation_cache.
 * Run on startup and hourly via PM2 cron.
 *
 * Usage: pnpm dlx tsx scripts/fetch-cda.ts
 */

import Database from "better-sqlite3";
import path from "path";

const CDA_BASE = "https://www.cda.pl";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface CdaMovie {
  title: string;
  year: number | null;
  url: string;
  poster_url: string | null;
  category: string;
}

function decodeEntities(str: string): string {
  return str
    .replace(/&oacute;/g, "ó")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function parseTitle(raw: string): { title: string; year: number | null } {
  const cleaned = decodeEntities(raw)
    .replace(/\s*(Lektor|Napisy|Cały film|Dubbing)\s*PL\s*$/i, "")
    .trim();

  const yearMatch = cleaned.match(/\((\d{4})\)\s*$/);
  if (yearMatch) {
    return {
      title: cleaned.replace(/\s*\(\d{4}\)\s*$/, "").trim(),
      year: parseInt(yearMatch[1], 10),
    };
  }
  return { title: cleaned, year: null };
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}

async function scrapePremium(): Promise<CdaMovie[]> {
  const res = await fetch(`${CDA_BASE}/premium`, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (!res.ok) {
    console.error(`[cda] Failed to fetch premium page: ${res.status}`);
    return [];
  }

  const html = await res.text();
  const movies: CdaMovie[] = [];
  const seen = new Set<string>();

  const regex =
    /<li class="mb-slide" title="([^"]*)">\s*<a href="([^"]*vfilm)">\s*<img[^>]*src="([^"]*)"/g;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const rawTitle = match[1];
    const url = match[2].startsWith("http")
      ? match[2]
      : `${CDA_BASE}${match[2]}`;
    const posterUrl = match[3];
    const { title, year } = parseTitle(rawTitle);

    if (title && !seen.has(url)) {
      seen.add(url);
      movies.push({
        title,
        year,
        url,
        poster_url: posterUrl,
        category: "Polecane",
      });
    }
  }

  return movies;
}

const CATEGORY_LABELS: Record<string, string> = {
  akcji: "Akcja",
  animowane: "Animowane",
  biograficzne: "Biograficzne",
  dokumentalne: "Dokumentalne",
  dramaty: "Dramaty",
  europejskie: "Europejskie",
  fantasy: "Fantasy",
  historyczne: "Historyczne",
  horror: "Horror",
  komedie: "Komedie",
  kryminalne: "Kryminalne",
  muzyczne: "Muzyczne",
  nagradzane: "Nagradzane",
  obyczajowe: "Obyczajowe",
  polskie: "Polskie",
  przygodowe: "Przygodowe",
  psychologiczne: "Psychologiczne",
  romanse: "Romanse",
  "sci-fi": "Sci-Fi",
  sensacyjne: "Sensacyjne",
  thrillery: "Thrillery",
  wojenne: "Wojenne",
  western: "Western",
};

const CATEGORIES = [
  "akcji",
  "animowane",
  "biograficzne",
  "dokumentalne",
  "dramaty",
  "europejskie",
  "fantasy",
  "historyczne",
  "horror",
  "komedie",
  "kryminalne",
  "muzyczne",
  "nagradzane",
  "obyczajowe",
  "polskie",
  "przygodowe",
  "psychologiczne",
  "romanse",
  "sci-fi",
  "sensacyjne",
  "thrillery",
  "wojenne",
  "western",
];

async function scrapeCategory(category: string): Promise<CdaMovie[]> {
  const res = await fetch(`${CDA_BASE}/premium/${category}`, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (!res.ok) return [];

  const html = await res.text();
  const movies: CdaMovie[] = [];
  const seen = new Set<string>();

  // Build poster map: title attr on img.cover-img -> poster URL
  const posterMap = new Map<string, string>();
  const posterRegex =
    /<img class="cover-img" title="([^"]*)"[^>]*src="([^"]*)"/g;
  let match;
  while ((match = posterRegex.exec(html)) !== null) {
    const imgTitle = decodeEntities(match[1]).trim();
    const posterUrl = match[2].startsWith("//")
      ? `https:${match[2]}`
      : match[2];
    posterMap.set(imgTitle, posterUrl);
  }

  // Extract title+url from kino-title links
  const titleRegex =
    /<a href="(https:\/\/www\.cda\.pl\/video\/[^"]*\/vfilm)" class="kino-title">([^<]*)<\/a>/g;
  while ((match = titleRegex.exec(html)) !== null) {
    const url = match[1];
    const rawTitle = decodeEntities(match[2]).trim();

    // Skip serials
    if (rawTitle.includes("Sezon") || rawTitle.includes("serial")) continue;

    const { title, year } = parseTitle(rawTitle);

    if (title && !seen.has(url)) {
      seen.add(url);
      movies.push({
        title,
        year,
        url,
        poster_url: posterMap.get(rawTitle) || null,
        category: CATEGORY_LABELS[category] || category,
      });
    }
  }

  return movies;
}

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

interface TmdbEnrichment {
  tmdb_id: number;
  genre: string;
  rating: number;
  description: string | null;
  tmdb_poster: string | null;
}

async function enrichFromTmdb(
  title: string,
  year: number | null,
): Promise<TmdbEnrichment | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  async function searchWithYear(y: number | null) {
    let url = `${TMDB_BASE}/search/movie?query=${encodeURIComponent(title)}&language=pl-PL&page=1`;
    if (y) url += `&year=${y}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    return await res.json();
  }

  // Try original year first
  let data = await searchWithYear(year);

  // If no match and year is provided, try +/- 1 year
  if ((!data || !data.results?.length) && year) {
    data = await searchWithYear(year + 1);
    if (!data || !data.results?.length) {
      data = await searchWithYear(year - 1);
    }
  }

  // If still no match, try without year
  if (!data || !data.results?.length) {
    data = await searchWithYear(null);
  }

  const match = data?.results?.[0];
  if (!match) return null;

  return {
    tmdb_id: match.id,
    genre: (match.genre_ids || [])
      .map((id: number) => TMDB_GENRE_MAP[id] || "Unknown")
      .join(", "),
    rating: Math.round(match.vote_average * 10) / 10,
    description: match.overview || null,
    tmdb_poster: match.poster_path
      ? `https://image.tmdb.org/t/p/w300${match.poster_path}`
      : null,
  };
}

async function main() {
  const dbPath = path.join(process.cwd(), "data", "movies.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  // Ensure tables exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS recommendation_cache (
      engine TEXT PRIMARY KEY, data TEXT NOT NULL, movie_count INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS recommended_movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tmdb_id INTEGER NOT NULL,
      engine TEXT NOT NULL,
      reason TEXT NOT NULL,
      title TEXT NOT NULL,
      year INTEGER, genre TEXT, rating REAL, poster_url TEXT,
      pl_title TEXT, cda_url TEXT, description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tmdb_id, engine)
    );
  `);

  console.log("[cda] Fetching CDA Premium...");
  const premiumMovies = await scrapePremium();
  console.log(`[cda] Premium: ${premiumMovies.length} movies`);

  // Scrape categories — track all categories per movie
  const allMovies: CdaMovie[] = [...premiumMovies];
  const seenUrls = new Set(premiumMovies.map((m) => m.url));
  const movieCategories = new Map<string, string[]>(); // url -> categories
  for (const m of premiumMovies) {
    movieCategories.set(m.url, ["Polecane"]);
  }

  for (const cat of CATEGORIES) {
    const catMovies = await scrapeCategory(cat);
    const label = CATEGORY_LABELS[cat] || cat;
    let added = 0;
    for (const m of catMovies) {
      // Track category even for dupes
      const cats = movieCategories.get(m.url) || [];
      cats.push(label);
      movieCategories.set(m.url, cats);

      if (!seenUrls.has(m.url)) {
        seenUrls.add(m.url);
        m.category = label;
        allMovies.push(m);
        added++;
      }
    }
    if (catMovies.length > 0) {
      console.log(`[cda] ${cat}: ${catMovies.length} found, ${added} new`);
    }
  }

  const movies = allMovies;
  console.log(`[cda] Total unique: ${movies.length}`);

  if (movies.length === 0) {
    db.close();
    return;
  }

  // Clear old CDA recommendations
  db.prepare("DELETE FROM recommended_movies WHERE engine = 'cda'").run();

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO recommended_movies (tmdb_id, engine, reason, title, year, genre, rating, poster_url, pl_title, cda_url, description)
    VALUES (?, 'cda', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  console.log(`[cda] Enriching ${movies.length} movies with TMDb data...`);
  let enriched = 0;

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    const tmdb = await enrichFromTmdb(movie.title, movie.year);

    if (tmdb) {
      insertStmt.run(
        tmdb.tmdb_id,
        movie.category,
        movie.title,
        movie.year,
        tmdb.genre,
        tmdb.rating,
        movie.poster_url,
        movie.title,
        movie.url,
        tmdb.description,
      );
      enriched++;
    } else {
      const pseudoId = Math.abs(hashCode(movie.url));
      insertStmt.run(
        pseudoId,
        movie.category,
        movie.title,
        movie.year,
        null,
        0,
        movie.poster_url,
        movie.title,
        movie.url,
        null,
      );
    }

    // Rate limit
    if (i % 35 === 34) await new Promise((r) => setTimeout(r, 1000));
    if ((i + 1) % 50 === 0)
      console.log(`  [cda] ${i + 1}/${movies.length} (${enriched} enriched)`);
  }

  db.close();
  console.log(`[cda] Enriched ${enriched}/${movies.length} with TMDb data`);

  // Count per category
  const catCounts = new Map<string, number>();
  for (const m of movies) {
    catCounts.set(m.category, (catCounts.get(m.category) || 0) + 1);
  }
  console.log(
    `[cda] Saved ${movies.length} movies in ${catCounts.size} categories:`,
  );
  for (const [cat, count] of [...catCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${cat}: ${count}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
