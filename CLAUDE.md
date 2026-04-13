# FilmPick

Personal movie discovery engine with a Next.js web UI and SQLite database.

## Tech Stack

- **Web app:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Database:** SQLite via `better-sqlite3`
- **Data sources:** TMDb API, Filmweb (import)
- **Testing:** Vitest
- **Package manager:** pnpm (do not use npm)
- **Secrets:** bioenv (Touch ID-protected Keychain)

## Commands

```bash
pnpm install
eval "$(bioenv load)"    # Load TMDB_API_KEY
pnpm dev                 # http://localhost:4000
pnpm type-check          # TypeScript check
pnpm test                # Run vitest
pnpm backup              # Backup SQLite DB
```

### Structure

```
├── app/
│   ├── page.tsx                      — Dashboard (Library + Recommendations tabs)
│   └── api/
│       ├── movies/route.ts           — GET/POST library
│       ├── movies/[id]/route.ts      — GET/DELETE single movie
│       ├── movies/[id]/full/route.ts — Full movie details with enrichment
│       ├── movies/[id]/play/route.ts — Launch local player
│       ├── movies/[id]/stream/route.ts — Stream video file
│       ├── movies/[id]/subtitles/route.ts — Subtitle management
│       ├── movies/[id]/standardize/route.ts — Standardize file naming
│       ├── movies/merge/route.ts     — Merge duplicate entries
│       ├── search/route.ts           — TMDb search
│       ├── recommendations/route.ts  — Generate recommendations
│       ├── recommendations/dismiss/route.ts — Dismiss recommendation
│       ├── recommendations/count/route.ts — Recommendation count
│       ├── person-ratings/route.ts   — Director/actor/writer ratings
│       ├── pl-title/route.ts         — Polish title lookup
│       ├── import/route.ts           — Import from filesystem directory
│       ├── import-filmweb/route.ts   — Import Filmweb ratings
│       ├── sync/route.ts             — Re-scan library path, add/remove
│       └── settings/route.ts         — GET/PUT app settings
├── components/
│   ├── TabNav.tsx                    — Pill-style tab navigation
│   ├── MovieCard.tsx                 — Poster card (user rating + global rating badges)
│   ├── MovieDetail.tsx               — Full movie detail view; MY RATING badge (♥) always visible, click to toggle 1–10 picker inline
│   ├── PersonView.tsx                — Person filmography view
│   ├── SearchModal.tsx               — TMDb search + add modal
│   ├── ImportModal.tsx               — Filesystem import modal
│   ├── SyncModal.tsx                 — Sync progress modal
│   ├── ConfigPanel.tsx               — Settings/config panel
│   ├── RecommendationRow.tsx         — Grouped recommendation row
│   ├── RecommendationSkeleton.tsx    — Loading skeleton
│   ├── SortFilterBar.tsx             — Sort (6 options) + genre filter
│   └── Toast.tsx                     — Toast notifications
├── lib/
│   ├── db.ts                         — SQLite schema, CRUD, settings, migrations
│   ├── tmdb.ts                       — TMDb API client
│   ├── cda.ts                        — CDA Premium streaming links
│   ├── utils.ts                      — Shared utilities
│   ├── scanner.ts                    — Filesystem video scanner + filename parser
│   └── engines/                      — Recommendation engines
│       ├── index.ts                  — Engine registry
│       ├── director.ts               — By director
│       ├── actor.ts                  — By actor
│       ├── genre.ts                  — By genre
│       ├── movie.ts                  — Similar movies (TMDb)
│       ├── hidden-gem.ts             — Hidden gems
│       ├── star-studded.ts           — Star-studded blockbusters
│       ├── random.ts                 — Surprise me
│       └── cda.ts                    — CDA Premium available
├── scripts/
│   ├── backup-db.sh                  — SQLite backup with tiered retention
│   ├── import-filmweb.ts             — Import Filmweb ratings export (JSON)
│   └── enrich-tmdb.ts                — Enrich existing movies with TMDb posters/genres
├── __tests__/                        — Vitest tests
└── data/
    ├── movies.db                     — SQLite DB (gitignored)
    └── backups/                      — Tiered backup retention (gitignored)
```

### Features

- **Library tab:** Movie grid with posters, user ratings (indigo ♥ badge), global ratings (yellow ★ badge)
- **Rating UX:** In detail view, MY RATING (♥) is always shown left of GLOBAL (★); click the indigo badge to open an inline 1–10 picker; current score is highlighted; picker closes on selection
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

### Logs

Next.js dev server logs to stdout. When running in the background:

```bash
# Start dev server with logs to file
nohup npx next dev --port 4000 > /tmp/movies-dev.log 2>&1 &

# Tail logs
tail -f /tmp/movies-dev.log

# Check for errors
grep -i error /tmp/movies-dev.log
```

Each request is logged as `GET /path STATUS in Xms`. API errors show as 500 with a stack trace including the failing source file and line number.

Common errors:

- **`better-sqlite3` native addon not found** — run `npx node-gyp rebuild` inside the `better-sqlite3` package dir (happens after `pnpm install` skips build scripts)
- **SWC binary missing** — install `@next/swc-linux-arm64-gnu` (or musl) for ARM64 Linux environments

## Docker

### Run with docker-compose (recommended)

```bash
# Pull and start using the pre-built image from GHCR
TMDB_API_KEY=<your_key> docker compose up -d

# Or with bioenv:
eval "$(bioenv load)" && docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

The `docker-compose.yml` uses `ghcr.io/3h4x/film-pick:latest` (built by GHA on push to master). Data is persisted in `./data/`.

### Build locally

```bash
docker build -t filmpick .
TMDB_API_KEY=<your_key> docker run -p 4000:4000 -v $(pwd)/data:/app/data -e TMDB_API_KEY filmpick
```

- **Image:** `ghcr.io/3h4x/film-pick:latest` (auto-built by GHA)
- **Port:** 4000
- **Data volume:** `./data` → `/app/data` (SQLite persistence)
- **Env:** `TMDB_API_KEY` required
- **Next.js output:** standalone mode (`next.config.ts`)

## Development

- Use `pnpm` exclusively (not npm)
- Conventional commits suggested
- Type check with `pnpm type-check` before committing
