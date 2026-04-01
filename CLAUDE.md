# Movies Organizer

Movie and TV series recommendation system with a Next.js web UI and SQLite database. Includes a Python CLI tool for bulk renaming/organizing media files.

## Tech Stack

- **Web app:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Database:** SQLite via `better-sqlite3`
- **Data sources:** TMDb API, Filmweb (import), IMDb (cinemagoer — CLI tool)
- **Testing:** Vitest (14 tests, 5 files)
- **Package manager:** pnpm (do not use npm)
- **Secrets:** bioenv (Touch ID-protected Keychain)

## Web App (`web/`)

```bash
cd web
pnpm install
eval "$(bioenv load)"    # Load TMDB_API_KEY
pnpm dev                 # http://localhost:4000
pnpm type-check          # TypeScript check
pnpm test                # Run vitest
pnpm backup              # Backup SQLite DB
```

### Structure

```
web/
├── app/
│   ├── page.tsx                      — Dashboard (Library + Recommendations tabs)
│   └── api/
│       ├── movies/route.ts           — GET/POST library
│       ├── movies/[id]/route.ts      — DELETE
│       ├── search/route.ts           — TMDb search
│       ├── recommendations/route.ts  — Generate recommendations
│       ├── import/route.ts           — Import from filesystem directory
│       ├── sync/route.ts             — Re-scan library path, add/remove
│       └── settings/route.ts         — GET library path
├── components/
│   ├── TabNav.tsx                    — Pill-style tab navigation
│   ├── MovieCard.tsx                 — Poster card (user rating + global rating badges)
│   ├── SearchModal.tsx               — TMDb search + add modal
│   ├── ImportModal.tsx               — Filesystem import modal
│   ├── RecommendationRow.tsx         — Grouped recommendation row
│   └── SortFilterBar.tsx             — Sort (6 options) + genre filter
├── lib/
│   ├── db.ts                         — SQLite schema, CRUD, settings, migrations
│   ├── tmdb.ts                       — TMDb API client
│   ├── recommend.ts                  — Recommendation engine
│   └── scanner.ts                    — Filesystem video scanner + filename parser
├── scripts/
│   ├── backup-db.sh                  — SQLite backup with tiered retention
│   ├── import-filmweb.ts             — Import Filmweb ratings export (JSON)
│   └── enrich-tmdb.ts                — Enrich existing movies with TMDb posters/genres
├── __tests__/                        — 14 tests across 5 files
└── data/
    ├── movies.db                     — SQLite DB (gitignored)
    └── backups/                      — Tiered backup retention (gitignored)
```

### Features

- **Library tab:** Movie grid with posters, user ratings (indigo badge), global ratings (yellow badge)
- **Sorting:** My Rating, Global Rating, Year, Title, Date Added, Date Rated — asc/desc toggle
- **Genre filter:** Dropdown with all genres from collection
- **Import:** Scan a directory for video files, parse filenames, fetch TMDb metadata
- **Sync:** Re-scan saved library path, add new files, remove deleted ones
- **Recommendations tab:** TMDb-based suggestions grouped by reason
- **Search:** TMDb search to manually add movies

### Database Schema

Movies table includes: title, year, genre, director, rating, poster_url, source, imdb_id, tmdb_id, type, file_path, filmweb_id, filmweb_url, user_rating, pl_title, rated_at

### Environment

Secrets managed via `bioenv`:

```bash
bioenv init                          # First time setup
bioenv set TMDB_API_KEY <token>      # Store TMDb read access token
eval "$(bioenv load)"                # Load into shell before running dev
```

### Scripts

```bash
# Import Filmweb ratings export
pnpm dlx tsx scripts/import-filmweb.ts <path-to-json> [--enrich]

# Enrich existing movies with TMDb posters (requires TMDB_API_KEY)
eval "$(bioenv load)" && pnpm dlx tsx scripts/enrich-tmdb.ts

# Backup DB (also available as: pnpm backup)
bash scripts/backup-db.sh

# PM2 scheduled backup (every 15 min)
pm2 start scripts/backup-db.sh --name movies-backup --cron-restart='*/15 * * * *' --no-autorestart
```

## CLI Tool (`src/`)

Python CLI for bulk renaming and organizing movie/series files using IMDb metadata. Still actively used.

```bash
cd src && pip install -r requirements.txt
python movies_organizer.py movies -p /path/to/movies
python movies_organizer.py series -p /path/to/series
```

- **Naming formats:**
  - Movies: `Movie Name (Year)/Movie Name (Year).ext`
  - Series: `Series Name/Season N/Series Name S01E01.ext`
- **Video extensions:** `.mp4`, `.mkv`, `.srt`, `.avi`, `.wmv`, `.m4v`, `.mov`, `.flv`, `.webm`

## Development

- Use `pnpm` exclusively (not npm)
- Conventional commits required (release-please on master)
- Run `pre-commit install --hook-type commit-msg` after cloning
- Type check with `pnpm type-check` before committing
