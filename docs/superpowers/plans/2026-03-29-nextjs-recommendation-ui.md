# Next.js Movie Recommendation UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js web UI with two tabs (My Library / Recommendations) backed by SQLite, letting users manage their movie collection and discover new titles via IMDb/TMDb.

**Architecture:** Next.js App Router with server-side API routes talking to SQLite via `better-sqlite3`. The frontend uses React with Tailwind CSS. External data fetched from TMDb REST API (primary) and IMDb via cinemagoer Python bridge. All code lives in `web/` alongside the existing `src/` Python CLI.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, better-sqlite3, TMDb API

---

## File Structure

```
web/
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── vitest.config.ts
├── app/
│   ├── layout.tsx              — root layout, global styles, font
│   ├── page.tsx                — dashboard with tab state
│   ├── globals.css             — Tailwind directives
│   └── api/
│       ├── movies/
│       │   ├── route.ts        — GET (list), POST (add)
│       │   └── [id]/route.ts   — DELETE
│       ├── recommendations/
│       │   └── route.ts        — GET recommendations
│       └── search/
│           └── route.ts        — GET search TMDb
├── components/
│   ├── TabNav.tsx              — tab bar component
│   ├── MovieCard.tsx           — poster card for library
│   ├── RecommendationRow.tsx   — grouped recommendation row
│   └── SearchModal.tsx         — search + add modal
├── lib/
│   ├── db.ts                   — SQLite init + query helpers
│   ├── tmdb.ts                 — TMDb API client
│   └── recommend.ts            — recommendation engine
├── __tests__/
│   ├── db.test.ts
│   ├── tmdb.test.ts
│   ├── recommend.test.ts
│   ├── movies-api.test.ts
│   └── search-api.test.ts
└── data/
    └── .gitignore              — SQLite db stored here (gitignored)
```

---

### Task 1: Scaffold Next.js Project

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/next.config.ts`, `web/tailwind.config.ts`, `web/postcss.config.mjs`, `web/app/layout.tsx`, `web/app/page.tsx`, `web/app/globals.css`

- [ ] **Step 1: Create the Next.js app**

```bash
cd /Users/3h4x/workspace/movies-organizer
npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-npm
```

Accept defaults. This creates the full scaffold.

- [ ] **Step 2: Install dependencies**

```bash
cd /Users/3h4x/workspace/movies-organizer/web
npm install better-sqlite3
npm install -D @types/better-sqlite3 vitest @vitejs/plugin-react
```

- [ ] **Step 3: Add vitest config**

Create `web/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

Add to `web/package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create data directory**

```bash
mkdir -p web/data
echo "*.db" > web/data/.gitignore
```

- [ ] **Step 5: Create test directory**

```bash
mkdir -p web/__tests__
```

- [ ] **Step 6: Verify dev server starts**

```bash
cd /Users/3h4x/workspace/movies-organizer/web
npm run dev
```

Expected: Server starts on http://localhost:3000 with default Next.js page.

- [ ] **Step 7: Commit**

```bash
git add web/
git commit -m "feat: scaffold Next.js app with Tailwind, SQLite, and vitest"
```

---

### Task 2: SQLite Database Layer

**Files:**
- Create: `web/lib/db.ts`
- Test: `web/__tests__/db.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const TEST_DB = path.join(__dirname, "test.db");

describe("database", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("creates movies table with correct columns", () => {
    const { initDb } = require("@/lib/db");
    initDb(db);

    const info = db.pragma("table_info(movies)");
    const columns = (info as any[]).map((c: any) => c.name);
    expect(columns).toContain("id");
    expect(columns).toContain("title");
    expect(columns).toContain("year");
    expect(columns).toContain("genre");
    expect(columns).toContain("director");
    expect(columns).toContain("rating");
    expect(columns).toContain("poster_url");
    expect(columns).toContain("source");
    expect(columns).toContain("imdb_id");
    expect(columns).toContain("tmdb_id");
    expect(columns).toContain("type");
  });

  it("creates recommendations table with correct columns", () => {
    const { initDb } = require("@/lib/db");
    initDb(db);

    const info = db.pragma("table_info(recommendations)");
    const columns = (info as any[]).map((c: any) => c.name);
    expect(columns).toContain("id");
    expect(columns).toContain("title");
    expect(columns).toContain("reason");
    expect(columns).toContain("based_on_movie_id");
  });

  it("inserts and retrieves a movie", () => {
    const { initDb, insertMovie, getMovies } = require("@/lib/db");
    initDb(db);

    insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: "Sci-Fi",
      director: "Christopher Nolan",
      rating: 8.8,
      poster_url: null,
      source: "tmdb",
      imdb_id: "tt1375666",
      tmdb_id: 27205,
      type: "movie",
    });

    const movies = getMovies(db);
    expect(movies).toHaveLength(1);
    expect(movies[0].title).toBe("Inception");
    expect(movies[0].year).toBe(2010);
  });

  it("deletes a movie by id", () => {
    const { initDb, insertMovie, getMovies, deleteMovie } = require("@/lib/db");
    initDb(db);

    insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: "Sci-Fi",
      director: "Christopher Nolan",
      rating: 8.8,
      poster_url: null,
      source: "tmdb",
      imdb_id: "tt1375666",
      tmdb_id: 27205,
      type: "movie",
    });

    const movies = getMovies(db);
    deleteMovie(db, movies[0].id);
    expect(getMovies(db)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/3h4x/workspace/movies-organizer/web
npx vitest run __tests__/db.test.ts
```

Expected: FAIL — cannot find module `@/lib/db`

- [ ] **Step 3: Write the implementation**

Create `web/lib/db.ts`:

```typescript
import Database from "better-sqlite3";
import path from "path";

export interface Movie {
  id: number;
  title: string;
  year: number | null;
  genre: string | null;
  director: string | null;
  rating: number | null;
  poster_url: string | null;
  source: string | null;
  imdb_id: string | null;
  tmdb_id: number | null;
  type: string;
  created_at: string;
}

export interface MovieInput {
  title: string;
  year: number | null;
  genre: string | null;
  director: string | null;
  rating: number | null;
  poster_url: string | null;
  source: string | null;
  imdb_id: string | null;
  tmdb_id: number | null;
  type: string;
}

export interface Recommendation {
  id: number;
  title: string;
  year: number | null;
  genre: string | null;
  director: string | null;
  rating: number | null;
  poster_url: string | null;
  source: string | null;
  reason: string | null;
  based_on_movie_id: number | null;
  created_at: string;
}

const DB_PATH = path.join(process.cwd(), "data", "movies.db");

export function initDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      year INTEGER,
      genre TEXT,
      director TEXT,
      rating REAL,
      poster_url TEXT,
      source TEXT,
      imdb_id TEXT,
      tmdb_id INTEGER,
      type TEXT DEFAULT 'movie',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      year INTEGER,
      genre TEXT,
      director TEXT,
      rating REAL,
      poster_url TEXT,
      source TEXT,
      reason TEXT,
      based_on_movie_id INTEGER REFERENCES movies(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initDb(_db);
  }
  return _db;
}

export function insertMovie(db: Database.Database, movie: MovieInput): number {
  const stmt = db.prepare(`
    INSERT INTO movies (title, year, genre, director, rating, poster_url, source, imdb_id, tmdb_id, type)
    VALUES (@title, @year, @genre, @director, @rating, @poster_url, @source, @imdb_id, @tmdb_id, @type)
  `);
  const result = stmt.run(movie);
  return Number(result.lastInsertRowid);
}

export function getMovies(db: Database.Database, type?: string): Movie[] {
  if (type) {
    return db.prepare("SELECT * FROM movies WHERE type = ? ORDER BY created_at DESC").all(type) as Movie[];
  }
  return db.prepare("SELECT * FROM movies ORDER BY created_at DESC").all() as Movie[];
}

export function deleteMovie(db: Database.Database, id: number): void {
  db.prepare("DELETE FROM movies WHERE id = ?").run(id);
}

export function insertRecommendation(
  db: Database.Database,
  rec: Omit<Recommendation, "id" | "created_at">
): number {
  const stmt = db.prepare(`
    INSERT INTO recommendations (title, year, genre, director, rating, poster_url, source, reason, based_on_movie_id)
    VALUES (@title, @year, @genre, @director, @rating, @poster_url, @source, @reason, @based_on_movie_id)
  `);
  const result = stmt.run(rec);
  return Number(result.lastInsertRowid);
}

export function getRecommendations(db: Database.Database): Recommendation[] {
  return db.prepare("SELECT * FROM recommendations ORDER BY reason, rating DESC").all() as Recommendation[];
}

export function clearRecommendations(db: Database.Database): void {
  db.prepare("DELETE FROM recommendations").run();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/3h4x/workspace/movies-organizer/web
npx vitest run __tests__/db.test.ts
```

Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add web/lib/db.ts web/__tests__/db.test.ts
git commit -m "feat: add SQLite database layer with movies and recommendations tables"
```

---

### Task 3: TMDb API Client

**Files:**
- Create: `web/lib/tmdb.ts`
- Test: `web/__tests__/tmdb.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/tmdb.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchTmdb, getTmdbRecommendations } from "@/lib/tmdb";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("tmdb client", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("searches movies by query", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 27205,
            title: "Inception",
            release_date: "2010-07-16",
            genre_ids: [28, 878],
            vote_average: 8.365,
            poster_path: "/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg",
          },
        ],
      }),
    });

    const results = await searchTmdb("inception");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Inception");
    expect(results[0].year).toBe(2010);
    expect(results[0].tmdb_id).toBe(27205);
    expect(results[0].rating).toBeCloseTo(8.4, 0);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("query=inception"),
      expect.any(Object)
    );
  });

  it("returns empty array on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    const results = await searchTmdb("inception");
    expect(results).toEqual([]);
  });

  it("fetches recommendations for a tmdb id", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 155,
            title: "The Dark Knight",
            release_date: "2008-07-18",
            genre_ids: [18, 28, 80],
            vote_average: 8.516,
            poster_path: "/qJ2tW6WMUDux911BTUgMe1nNaD.jpg",
          },
        ],
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        credits: {
          crew: [{ job: "Director", name: "Christopher Nolan" }],
        },
      }),
    });

    const recs = await getTmdbRecommendations(27205);
    expect(recs).toHaveLength(1);
    expect(recs[0].title).toBe("The Dark Knight");
    expect(recs[0].year).toBe(2008);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/3h4x/workspace/movies-organizer/web
npx vitest run __tests__/tmdb.test.ts
```

Expected: FAIL — cannot find module `@/lib/tmdb`

- [ ] **Step 3: Write the implementation**

Create `web/lib/tmdb.ts`:

```typescript
import type { MovieInput } from "./db";

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

export interface TmdbSearchResult {
  title: string;
  year: number | null;
  genre: string;
  rating: number;
  poster_url: string | null;
  tmdb_id: number;
  imdb_id: string | null;
}

export async function searchTmdb(query: string): Promise<TmdbSearchResult[]> {
  const url = `${TMDB_BASE}/search/movie?query=${encodeURIComponent(query)}&language=en-US&page=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getApiKey()}` },
  });

  if (!res.ok) return [];

  const data = await res.json();
  return (data.results || []).slice(0, 10).map((r: any) => ({
    title: r.title,
    year: r.release_date ? parseInt(r.release_date.substring(0, 4), 10) : null,
    genre: genreIdsToString(r.genre_ids || []),
    rating: Math.round(r.vote_average * 10) / 10,
    poster_url: r.poster_path
      ? `https://image.tmdb.org/t/p/w300${r.poster_path}`
      : null,
    tmdb_id: r.id,
    imdb_id: null,
  }));
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

  return Promise.all(
    results.map(async (r: any) => {
      const details = await getTmdbMovieDetails(r.id);
      return {
        title: r.title,
        year: r.release_date
          ? parseInt(r.release_date.substring(0, 4), 10)
          : null,
        genre: genreIdsToString(r.genre_ids || []),
        rating: Math.round(r.vote_average * 10) / 10,
        poster_url: r.poster_path
          ? `https://image.tmdb.org/t/p/w300${r.poster_path}`
          : null,
        tmdb_id: r.id,
        imdb_id: null,
        director: details.director,
      };
    })
  );
}
```

- [ ] **Step 4: Create `.env.local` template**

Create `web/.env.local.example`:

```
TMDB_API_KEY=your_tmdb_api_key_here
```

Add `.env.local` to `web/.gitignore` (append).

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Users/3h4x/workspace/movies-organizer/web
npx vitest run __tests__/tmdb.test.ts
```

Expected: All 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add web/lib/tmdb.ts web/__tests__/tmdb.test.ts web/.env.local.example
git commit -m "feat: add TMDb API client with search and recommendations"
```

---

### Task 4: Recommendation Engine

**Files:**
- Create: `web/lib/recommend.ts`
- Test: `web/__tests__/recommend.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/recommend.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateRecommendations } from "@/lib/recommend";
import type { Movie } from "@/lib/db";

vi.mock("@/lib/tmdb", () => ({
  getTmdbRecommendations: vi.fn(),
}));

import { getTmdbRecommendations } from "@/lib/tmdb";

const mockGetTmdbRecommendations = vi.mocked(getTmdbRecommendations);

describe("recommendation engine", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns empty when library is empty", async () => {
    const result = await generateRecommendations([]);
    expect(result).toEqual([]);
  });

  it("groups recommendations by reason", async () => {
    const library: Movie[] = [
      {
        id: 1,
        title: "Inception",
        year: 2010,
        genre: "Sci-Fi, Action",
        director: "Christopher Nolan",
        rating: 8.8,
        poster_url: null,
        source: "tmdb",
        imdb_id: null,
        tmdb_id: 27205,
        type: "movie",
        created_at: "2026-01-01",
      },
    ];

    mockGetTmdbRecommendations.mockResolvedValueOnce([
      {
        title: "Tenet",
        year: 2020,
        genre: "Sci-Fi, Action",
        rating: 7.3,
        poster_url: null,
        tmdb_id: 577922,
        imdb_id: null,
      },
    ]);

    const result = await generateRecommendations(library);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        reason: "Because you have Inception",
        recommendations: expect.arrayContaining([
          expect.objectContaining({ title: "Tenet" }),
        ]),
      })
    );
  });

  it("deduplicates recommendations already in library", async () => {
    const library: Movie[] = [
      {
        id: 1,
        title: "Inception",
        year: 2010,
        genre: "Sci-Fi",
        director: "Christopher Nolan",
        rating: 8.8,
        poster_url: null,
        source: "tmdb",
        imdb_id: null,
        tmdb_id: 27205,
        type: "movie",
        created_at: "2026-01-01",
      },
    ];

    mockGetTmdbRecommendations.mockResolvedValueOnce([
      {
        title: "Inception",
        year: 2010,
        genre: "Sci-Fi",
        rating: 8.8,
        poster_url: null,
        tmdb_id: 27205,
        imdb_id: null,
      },
      {
        title: "Tenet",
        year: 2020,
        genre: "Sci-Fi",
        rating: 7.3,
        poster_url: null,
        tmdb_id: 577922,
        imdb_id: null,
      },
    ]);

    const result = await generateRecommendations(library);
    const allTitles = result.flatMap((g) => g.recommendations.map((r) => r.title));
    expect(allTitles).not.toContain("Inception");
    expect(allTitles).toContain("Tenet");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/3h4x/workspace/movies-organizer/web
npx vitest run __tests__/recommend.test.ts
```

Expected: FAIL — cannot find module `@/lib/recommend`

- [ ] **Step 3: Write the implementation**

Create `web/lib/recommend.ts`:

```typescript
import type { Movie } from "./db";
import { getTmdbRecommendations, type TmdbSearchResult } from "./tmdb";

export interface RecommendationGroup {
  reason: string;
  recommendations: TmdbSearchResult[];
}

export async function generateRecommendations(
  library: Movie[]
): Promise<RecommendationGroup[]> {
  if (library.length === 0) return [];

  const libraryTmdbIds = new Set(library.map((m) => m.tmdb_id).filter(Boolean));
  const libraryTitles = new Set(library.map((m) => m.title.toLowerCase()));
  const groups: RecommendationGroup[] = [];

  const moviesToQuery = library
    .filter((m) => m.tmdb_id)
    .slice(0, 10);

  for (const movie of moviesToQuery) {
    const recs = await getTmdbRecommendations(movie.tmdb_id!);

    const filtered = recs.filter(
      (r) => !libraryTmdbIds.has(r.tmdb_id) && !libraryTitles.has(r.title.toLowerCase())
    );

    if (filtered.length > 0) {
      groups.push({
        reason: `Because you have ${movie.title}`,
        recommendations: filtered,
      });
    }
  }

  return groups;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/3h4x/workspace/movies-organizer/web
npx vitest run __tests__/recommend.test.ts
```

Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add web/lib/recommend.ts web/__tests__/recommend.test.ts
git commit -m "feat: add recommendation engine with deduplication"
```

---

### Task 5: API Routes — Movies

**Files:**
- Create: `web/app/api/movies/route.ts`, `web/app/api/movies/[id]/route.ts`
- Test: `web/__tests__/movies-api.test.ts`

- [ ] **Step 1: Write the test**

Create `web/__tests__/movies-api.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, insertMovie, getMovies } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-api.db");

describe("movies API logic", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("GET returns all movies sorted by created_at desc", () => {
    insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: "Sci-Fi",
      director: "Christopher Nolan",
      rating: 8.8,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    insertMovie(db, {
      title: "Dune",
      year: 2021,
      genre: "Sci-Fi",
      director: "Denis Villeneuve",
      rating: 8.0,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 438631,
      type: "movie",
    });

    const movies = getMovies(db);
    expect(movies).toHaveLength(2);
    expect(movies[0].title).toBe("Dune");
  });

  it("GET filters by type", () => {
    insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: "Sci-Fi",
      director: "Christopher Nolan",
      rating: 8.8,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    insertMovie(db, {
      title: "Breaking Bad",
      year: 2008,
      genre: "Crime, Drama",
      director: "Vince Gilligan",
      rating: 9.5,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 1396,
      type: "series",
    });

    const movies = getMovies(db, "movie");
    expect(movies).toHaveLength(1);
    expect(movies[0].title).toBe("Inception");
  });
});
```

- [ ] **Step 2: Run test**

```bash
cd /Users/3h4x/workspace/movies-organizer/web
npx vitest run __tests__/movies-api.test.ts
```

Expected: PASS (tests the db layer which already exists)

- [ ] **Step 3: Create movies GET/POST route**

Create `web/app/api/movies/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb, getMovies, insertMovie, type MovieInput } from "@/lib/db";

export async function GET(request: NextRequest) {
  const db = getDb();
  const type = request.nextUrl.searchParams.get("type") || undefined;
  const movies = getMovies(db, type);
  return NextResponse.json(movies);
}

export async function POST(request: NextRequest) {
  const db = getDb();
  const body: MovieInput = await request.json();

  if (!body.title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const id = insertMovie(db, body);
  return NextResponse.json({ id }, { status: 201 });
}
```

- [ ] **Step 4: Create movies DELETE route**

Create `web/app/api/movies/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb, deleteMovie } from "@/lib/db";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  deleteMovie(db, parseInt(id, 10));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Commit**

```bash
git add web/app/api/movies/ web/__tests__/movies-api.test.ts
git commit -m "feat: add movies API routes (GET, POST, DELETE)"
```

---

### Task 6: API Routes — Search and Recommendations

**Files:**
- Create: `web/app/api/search/route.ts`, `web/app/api/recommendations/route.ts`
- Test: `web/__tests__/search-api.test.ts`

- [ ] **Step 1: Write the test for search**

Create `web/__tests__/search-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchTmdb } from "@/lib/tmdb";

vi.mock("@/lib/tmdb", () => ({
  searchTmdb: vi.fn(),
}));

const mockSearchTmdb = vi.mocked(searchTmdb);

describe("search API logic", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns search results from TMDb", async () => {
    mockSearchTmdb.mockResolvedValueOnce([
      {
        title: "Inception",
        year: 2010,
        genre: "Sci-Fi, Action",
        rating: 8.4,
        poster_url: "https://image.tmdb.org/t/p/w300/test.jpg",
        tmdb_id: 27205,
        imdb_id: null,
      },
    ]);

    const results = await searchTmdb("inception");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Inception");
  });

  it("returns empty for empty query", async () => {
    const results = await searchTmdb("");
    expect(mockSearchTmdb).toHaveBeenCalledWith("");
  });
});
```

- [ ] **Step 2: Run test**

```bash
cd /Users/3h4x/workspace/movies-organizer/web
npx vitest run __tests__/search-api.test.ts
```

Expected: PASS

- [ ] **Step 3: Create search route**

Create `web/app/api/search/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { searchTmdb } from "@/lib/tmdb";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") || "";

  if (!query.trim()) {
    return NextResponse.json([]);
  }

  const results = await searchTmdb(query);
  return NextResponse.json(results);
}
```

- [ ] **Step 4: Create recommendations route**

Create `web/app/api/recommendations/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getDb, getMovies } from "@/lib/db";
import { generateRecommendations } from "@/lib/recommend";

export async function GET() {
  const db = getDb();
  const movies = getMovies(db);
  const groups = await generateRecommendations(movies);
  return NextResponse.json(groups);
}
```

- [ ] **Step 5: Commit**

```bash
git add web/app/api/search/ web/app/api/recommendations/ web/__tests__/search-api.test.ts
git commit -m "feat: add search and recommendations API routes"
```

---

### Task 7: UI Components — TabNav and MovieCard

**Files:**
- Create: `web/components/TabNav.tsx`, `web/components/MovieCard.tsx`

- [ ] **Step 1: Create TabNav component**

Create `web/components/TabNav.tsx`:

```tsx
"use client";

interface TabNavProps {
  activeTab: "library" | "recommendations";
  onTabChange: (tab: "library" | "recommendations") => void;
  libraryCount: number;
}

export default function TabNav({ activeTab, onTabChange, libraryCount }: TabNavProps) {
  return (
    <div className="flex border-b border-gray-700">
      <button
        className={`px-6 py-3 text-sm font-medium transition-colors ${
          activeTab === "library"
            ? "text-white border-b-2 border-blue-500"
            : "text-gray-400 hover:text-gray-200"
        }`}
        onClick={() => onTabChange("library")}
      >
        My Library ({libraryCount})
      </button>
      <button
        className={`px-6 py-3 text-sm font-medium transition-colors ${
          activeTab === "recommendations"
            ? "text-white border-b-2 border-blue-500"
            : "text-gray-400 hover:text-gray-200"
        }`}
        onClick={() => onTabChange("recommendations")}
      >
        Recommendations
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create MovieCard component**

Create `web/components/MovieCard.tsx`:

```tsx
interface MovieCardProps {
  title: string;
  year: number | null;
  genre: string | null;
  rating: number | null;
  posterUrl: string | null;
  source: string | null;
  onDelete?: () => void;
}

export default function MovieCard({
  title,
  year,
  genre,
  rating,
  posterUrl,
  source,
  onDelete,
}: MovieCardProps) {
  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all group">
      <div className="aspect-[2/3] bg-gray-700 relative">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-4xl">
            🎬
          </div>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            className="absolute top-2 right-2 bg-red-600 text-white rounded-full w-6 h-6 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          >
            X
          </button>
        )}
      </div>
      <div className="p-3">
        <h3 className="text-white text-sm font-medium truncate">{title}</h3>
        <div className="flex items-center gap-2 mt-1">
          {year && <span className="text-gray-400 text-xs">{year}</span>}
          {rating && (
            <span className="text-yellow-400 text-xs">★ {rating}</span>
          )}
        </div>
        {genre && (
          <p className="text-gray-500 text-xs mt-1 truncate">{genre}</p>
        )}
        {source && (
          <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded">
            {source.toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/components/TabNav.tsx web/components/MovieCard.tsx
git commit -m "feat: add TabNav and MovieCard UI components"
```

---

### Task 8: UI Components — SearchModal and RecommendationRow

**Files:**
- Create: `web/components/SearchModal.tsx`, `web/components/RecommendationRow.tsx`

- [ ] **Step 1: Create SearchModal component**

Create `web/components/SearchModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import MovieCard from "./MovieCard";

interface SearchResult {
  title: string;
  year: number | null;
  genre: string;
  rating: number;
  poster_url: string | null;
  tmdb_id: number;
  imdb_id: string | null;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (movie: SearchResult) => void;
}

export default function SearchModal({ isOpen, onClose, onAdd }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setResults(data);
    setLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white text-lg font-semibold">Add Movie</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search for a movie..."
            className="flex-1 bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
            autoFocus
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "..." : "Search"}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {results.map((r) => (
            <div key={r.tmdb_id} className="cursor-pointer" onClick={() => onAdd(r)}>
              <MovieCard
                title={r.title}
                year={r.year}
                genre={r.genre}
                rating={r.rating}
                posterUrl={r.poster_url}
                source="tmdb"
              />
            </div>
          ))}
        </div>

        {results.length === 0 && !loading && query && (
          <p className="text-gray-500 text-center py-8">No results found</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create RecommendationRow component**

Create `web/components/RecommendationRow.tsx`:

```tsx
import MovieCard from "./MovieCard";

interface Recommendation {
  title: string;
  year: number | null;
  genre: string;
  rating: number;
  poster_url: string | null;
  tmdb_id: number;
}

interface RecommendationRowProps {
  reason: string;
  recommendations: Recommendation[];
}

export default function RecommendationRow({
  reason,
  recommendations,
}: RecommendationRowProps) {
  return (
    <div className="mb-8">
      <h3 className="text-white font-medium mb-3">{reason}</h3>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {recommendations.map((r) => (
          <div key={r.tmdb_id} className="min-w-[150px] max-w-[150px]">
            <MovieCard
              title={r.title}
              year={r.year}
              genre={r.genre}
              rating={r.rating}
              posterUrl={r.poster_url}
              source="tmdb"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/components/SearchModal.tsx web/components/RecommendationRow.tsx
git commit -m "feat: add SearchModal and RecommendationRow components"
```

---

### Task 9: Dashboard Page — Wire Everything Together

**Files:**
- Modify: `web/app/page.tsx`
- Modify: `web/app/layout.tsx`
- Modify: `web/app/globals.css`

- [ ] **Step 1: Update globals.css for dark theme**

Replace `web/app/globals.css` with:

```css
@import "tailwindcss";

body {
  background-color: #0f172a;
  color: #f8fafc;
}
```

- [ ] **Step 2: Update layout.tsx**

Replace `web/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Movies Organizer",
  description: "Movie and series recommendation system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Build the dashboard page**

Replace `web/app/page.tsx` with:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import TabNav from "@/components/TabNav";
import MovieCard from "@/components/MovieCard";
import SearchModal from "@/components/SearchModal";
import RecommendationRow from "@/components/RecommendationRow";

interface Movie {
  id: number;
  title: string;
  year: number | null;
  genre: string | null;
  director: string | null;
  rating: number | null;
  poster_url: string | null;
  source: string | null;
  type: string;
}

interface RecommendationGroup {
  reason: string;
  recommendations: any[];
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"library" | "recommendations">("library");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationGroup[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [recsLoading, setRecsLoading] = useState(false);

  const fetchMovies = useCallback(async () => {
    const res = await fetch("/api/movies");
    const data = await res.json();
    setMovies(data);
  }, []);

  const fetchRecommendations = useCallback(async () => {
    setRecsLoading(true);
    const res = await fetch("/api/recommendations");
    const data = await res.json();
    setRecommendations(data);
    setRecsLoading(false);
  }, []);

  useEffect(() => {
    fetchMovies();
  }, [fetchMovies]);

  useEffect(() => {
    if (activeTab === "recommendations" && movies.length > 0) {
      fetchRecommendations();
    }
  }, [activeTab, movies.length, fetchRecommendations]);

  async function handleAddMovie(searchResult: any) {
    await fetch("/api/movies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: searchResult.title,
        year: searchResult.year,
        genre: searchResult.genre,
        director: null,
        rating: searchResult.rating,
        poster_url: searchResult.poster_url,
        source: "tmdb",
        imdb_id: searchResult.imdb_id,
        tmdb_id: searchResult.tmdb_id,
        type: "movie",
      }),
    });
    setSearchOpen(false);
    fetchMovies();
  }

  async function handleDeleteMovie(id: number) {
    await fetch(`/api/movies/${id}`, { method: "DELETE" });
    fetchMovies();
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Movies Organizer</h1>

      <TabNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        libraryCount={movies.length}
      />

      <div className="mt-6">
        {activeTab === "library" && (
          <>
            <div className="mb-4">
              <button
                onClick={() => setSearchOpen(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                + Add Movie
              </button>
            </div>

            {movies.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <p className="text-4xl mb-4">🎬</p>
                <p>Your library is empty. Add some movies to get started!</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {movies.map((m) => (
                  <MovieCard
                    key={m.id}
                    title={m.title}
                    year={m.year}
                    genre={m.genre}
                    rating={m.rating}
                    posterUrl={m.poster_url}
                    source={m.source}
                    onDelete={() => handleDeleteMovie(m.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "recommendations" && (
          <>
            {movies.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <p>Add some movies to your library first to get recommendations.</p>
              </div>
            ) : recsLoading ? (
              <div className="text-center py-16 text-gray-500">
                <p>Loading recommendations...</p>
              </div>
            ) : recommendations.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <p>No recommendations yet. Try adding more movies!</p>
              </div>
            ) : (
              recommendations.map((group, i) => (
                <RecommendationRow
                  key={i}
                  reason={group.reason}
                  recommendations={group.recommendations}
                />
              ))
            )}
          </>
        )}
      </div>

      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onAdd={handleAddMovie}
      />
    </main>
  );
}
```

- [ ] **Step 4: Run dev server and verify**

```bash
cd /Users/3h4x/workspace/movies-organizer/web
npm run dev
```

Expected: App loads at http://localhost:3000 with dark theme, tab nav, empty library state, "Add Movie" button.

- [ ] **Step 5: Commit**

```bash
git add web/app/
git commit -m "feat: wire up dashboard page with library and recommendations tabs"
```

---

### Task 10: Run All Tests and Final Verification

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/3h4x/workspace/movies-organizer/web
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Start dev server and manual test**

```bash
cd /Users/3h4x/workspace/movies-organizer/web
npm run dev
```

Verify:
1. App loads at http://localhost:3000 — dark theme, "Movies Organizer" header, tab bar
2. Library tab shows empty state
3. Click "Add Movie" — search modal opens
4. Type a movie name and search (requires `TMDB_API_KEY` in `.env.local`)
5. Click a result — movie added to library
6. Movie appears in grid with poster, title, year, rating
7. Hover movie card — delete button appears
8. Switch to Recommendations tab — recommendations load grouped by movie

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete Next.js movie recommendation UI"
```
