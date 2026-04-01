# Movies Organizer — Next.js Recommendation UI

## Overview

Upgrade the movies-organizer project with a Next.js web UI that lets users manage their movie/series library and get recommendations. The existing Python CLI tool for file renaming remains intact.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Database:** SQLite via `better-sqlite3`
- **Data sources:** IMDb (cinemagoer via API route), TMDb (REST API, free key), Filmweb (scraping)
- **Styling:** Tailwind CSS

## UI Layout

Top tab bar with two tabs:

### Tab 1: My Library

- Grid of movie/series cards showing: poster (placeholder if unavailable), title, year, genre, rating
- "Add Movie" button → opens search modal
- Search modal: type a title → searches IMDb/TMDb → select result → added to library with metadata
- Filter/sort by genre, year, rating, type (movie/series)

### Tab 2: Recommendations

- Grouped recommendation rows with reason labels (e.g., "Because you love sci-fi...", "Top rated you're missing...")
- Each card: title, year, rating, source badge (IMDb/TMDb/Filmweb)
- Recommendations generated based on genres, directors, and ratings in the user's library

## SQLite Schema

```sql
CREATE TABLE movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  year INTEGER,
  genre TEXT,
  director TEXT,
  rating REAL,
  poster_url TEXT,
  source TEXT, -- 'imdb', 'tmdb', 'filmweb'
  imdb_id TEXT,
  tmdb_id INTEGER,
  type TEXT DEFAULT 'movie', -- 'movie' or 'series'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  year INTEGER,
  genre TEXT,
  director TEXT,
  rating REAL,
  poster_url TEXT,
  source TEXT,
  reason TEXT, -- e.g., 'genre:sci-fi', 'director:Christopher Nolan'
  based_on_movie_id INTEGER REFERENCES movies(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/movies` | List all library entries (supports `?type=movie&sort=rating`) |
| POST | `/api/movies` | Add a movie/series to the library |
| DELETE | `/api/movies/[id]` | Remove from library |
| GET | `/api/recommendations` | Generate recommendations based on library content |
| GET | `/api/search?q=` | Search IMDb/TMDb for movies to add |

## Data Flow

1. User searches for a movie → `/api/search` queries IMDb + TMDb
2. User selects a result → `POST /api/movies` stores it in SQLite with metadata
3. User visits Recommendations tab → `/api/recommendations` analyzes library genres/directors, queries external sources for similar titles, returns grouped results
4. Recommendations are cached in the `recommendations` table to avoid repeated API calls

## Project Structure

```
web/
  app/
    layout.tsx
    page.tsx           -- dashboard with tab navigation
    api/
      movies/
        route.ts       -- GET, POST library
        [id]/route.ts  -- DELETE
      recommendations/
        route.ts       -- GET recommendations
      search/
        route.ts       -- GET search
  components/
    TabNav.tsx
    MovieCard.tsx
    RecommendationRow.tsx
    SearchModal.tsx
  lib/
    db.ts              -- SQLite connection + init
    imdb.ts            -- IMDb search/fetch
    tmdb.ts            -- TMDb API client
    filmweb.ts         -- Filmweb scraper
    recommend.ts       -- Recommendation engine
  public/
src/                   -- existing Python CLI (untouched)
```

## Verification

1. `npm run dev` starts without errors
2. Library tab renders empty state, add a movie via search
3. Movie appears in library grid
4. Recommendations tab shows grouped suggestions based on added movies
5. SQLite database file is created and contains correct data
