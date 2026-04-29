# FilmPick

Personal movie discovery engine with a Next.js web UI and SQLite database.

## Tech Stack

- **Web app:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Database:** SQLite via `better-sqlite3`
- **Data sources:** TMDb API, Filmweb (one-time import only — no scheduled sync)
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
│       ├── recommendations/mood/route.ts — Mood-based recommendations
│       ├── person-ratings/route.ts   — Director/actor/writer ratings
│       ├── pl-title/route.ts         — Polish title lookup
│       ├── import/route.ts           — Import from filesystem directory
│       ├── sync/route.ts             — Re-scan library path, add/remove
│       ├── settings/route.ts         — GET/PUT app settings
│       ├── backup/route.ts           — Trigger manual DB backup
│       ├── cda-refresh/route.ts      — Refresh CDA availability cache
│       └── tv/
│           ├── route.ts              — Fetch TV guide (EPG)
│           ├── refresh/route.ts      — Trigger EPG refresh
│           ├── enrich/route.ts       — Enrich TV show entries from TMDb
│           └── blacklist/route.ts    — Manage EPG channel blacklist
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
│   ├── TvTab.tsx                     — TV guide tab
│   ├── Toast.tsx                     — Toast notifications
│   └── views/                        — Full tab-level view components
│       ├── LibraryView.tsx           — Library grid view
│       ├── RecommendationsView.tsx   — Recommendations view
│       ├── WishlistView.tsx          — Wishlist view
│       ├── SearchView.tsx            — Search view
│       └── ConfigView.tsx            — Settings/config view
├── lib/
│   ├── db.ts                         — SQLite schema, CRUD, settings, migrations
│   ├── tmdb.ts                       — TMDb API client
│   ├── cda.ts                        — CDA Premium streaming links
│   ├── cda-fetch.ts                  — CDA availability fetch + cache
│   ├── cda-scheduler.ts              — Scheduled CDA refresh job
│   ├── epg-fetch.ts                  — EPG/TV guide fetch + in-memory cache
│   ├── epg-scheduler.ts              — Scheduled EPG refresh job
│   ├── epg-presets.ts                — Built-in EPG source presets
│   ├── mood-presets.ts               — Mood recommendation presets
│   ├── backup.ts                     — Programmatic DB backup (used by backup API)
│   ├── types.ts                      — Shared TypeScript types (Movie, RecType, AppTab, etc.)
│   ├── utils.ts                      — Shared utilities
│   ├── scanner.ts                    — Filesystem video scanner + filename parser
│   ├── hooks/                        — React hooks
│   │   ├── useLibrary.ts             — Library fetch + filtering state
│   │   ├── useRecommendations.ts     — Recommendations fetch + state
│   │   ├── useSearch.ts              — TMDb search state
│   │   └── useSettings.ts            — App settings fetch/update
│   └── engines/                      — Recommendation engines
│       ├── index.ts                  — Engine registry
│       ├── director.ts               — By director
│       ├── actor.ts                  — By actor
│       ├── genre.ts                  — By genre
│       ├── movie.ts                  — Similar movies (TMDb)
│       ├── hidden-gem.ts             — Hidden gems
│       ├── star-studded.ts           — Star-studded blockbusters
│       ├── random.ts                 — Surprise me
│       ├── watchlist.ts              — From watchlist
│       ├── mood.ts                   — Mood-based recommendations
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
- **Wishlist:** Flag movies with `wishlist=1`; dedicated tab; watchlist recommendation engine picks from it
- **TV guide (EPG):** Fetches and caches an M3U/EPG feed; configurable via settings; scheduled refresh; channel blacklist
- **Mood recommendations:** Predefined mood presets map to TMDb genre/keyword queries
- **CDA integration:** `cda.ts` resolves streaming URLs; `cda-scheduler.ts` refreshes availability cache on a schedule
- **URL hash deep-link:** `#movie-<id>` in the URL opens the movie detail modal directly on page load
- **hasFileOnly filter:** Library can be filtered to show only movies with a local file path (`hasFileOnly=1`)
- **Lazy enrichment:** `GET /api/movies/[id]/full` lazily fetches and stores `pl_title` and `description` from TMDb on first access
- **TMDb TTL cache:** `lib/tmdb.ts` keeps an in-memory TTL cache for `getMovieLocalized` and `getTmdbMovieDetails` to reduce redundant API calls

### Database Schema

**movies**: id, title, year, genre, director, writer, actors, rating, user_rating, poster_url, source, imdb_id, tmdb_id, type (`movie`|`tv`), file_path, extra_files (JSON), video_metadata (JSON), filmweb_id, filmweb_url, cda_url, pl_title, description, rated_at, created_at, wishlist (0|1)

**Other tables**: settings (key/value), dismissed_recommendations (tmdb_id), recommendation_cache (engine, data, movie_count), recommended_movies (tmdb_id, engine, reason, title, year, genre, rating, poster_url, pl_title, cda_url, description), _migrations (migration guard)

### Environment

Secrets managed via `bioenv`:

```bash
bioenv init                          # First time setup
bioenv set TMDB_API_KEY <token>      # Store TMDb read access token
eval "$(bioenv load)"                # Load into shell before running dev
```

### Scripts

```bash
# One-time import of Filmweb ratings export (run once after exporting from Filmweb)
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

Watchtower is included in `docker-compose.yml` and polls GHCR every 5 minutes. When GHA pushes a new `:latest`, Watchtower pulls it and restarts the `filmpick` container automatically. No credentials needed — the image is public. Watchtower is scoped to the `filmpick` label only and will not touch other containers on the host.

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

## Coding Conventions

1. **TypeScript strict mode is on.** All code must pass `pnpm type-check` with no errors. Avoid `any` even though the ESLint rule is disabled — use proper types or `unknown`.
2. **Path alias `@/*` maps to the project root.** Use it for all cross-directory imports (e.g. `import { getDb } from "@/lib/db"`). Avoid `../..` relative chains.
3. **React components are functional only.** No class components.
4. **All DB access goes through `lib/db.ts`.** Never call `better-sqlite3` directly in route handlers or components — only through the exported functions in `lib/db.ts`.
5. **All TMDb API calls go through `lib/tmdb.ts`.** Never call `fetch("https://api.themoviedb.org/...")` directly outside that module.
6. **Async/await only.** No raw `.then()` chains.
7. **ESLint + lint-staged run automatically** on `git commit` (ESLint `--fix` + type-check + full test suite). Do not skip hooks with `--no-verify`.
8. **Pre-push hook runs `pnpm lint && pnpm test`.** Ensure both pass before pushing.
9. **File naming:** React components and view files use PascalCase (`MovieCard.tsx`). Library modules and hooks use kebab-case (`cda-fetch.ts`, `useLibrary.ts`).
10. **API error responses** always use `Response.json({ error: "..." }, { status: N })`. Use 400 for bad input, 404 for missing resources, 500 for unexpected failures. Never throw unhandled errors from route handlers — catch and return a 500.
11. **Shared TypeScript types** belong in `lib/types.ts`. Do not define `Movie`, `RecType`, `AppTab`, or similar cross-cutting types in individual modules.
12. **React hooks** for data fetching and complex state belong in `lib/hooks/`. Route handlers and components must not duplicate fetch logic that already exists in a hook.

## Testing Rules

1. **Test runner:** Vitest (`pnpm test` = `vitest run`; `pnpm test:watch` = interactive).
2. **Tests live in `__tests__/`** and are named `<subject>.test.ts`. No colocated tests.
3. **Use a real SQLite file for DB tests** (pattern: `new Database(TEST_DB)` + `initDb(db)` in `beforeEach`; close and `unlinkSync` in `afterEach`). Never mock the database layer — integration test against real SQLite.
4. **Mock external HTTP** (TMDb, CDA) with `vi.fn()` assigned to `global.fetch`. Do not make real network calls in tests.
5. **Run `pnpm test` after every code change** to verify nothing regressed. The lint-staged config also runs the full suite on commit.
6. **New API routes and business logic require tests.** Trivial pass-through wrappers and UI-only components do not.
7. **E2E tests** use Playwright (`pnpm test:e2e`). These are separate from unit tests and are not run by the pre-push hook.

## Architecture Patterns

1. New API routes belong under `app/api/<resource>/route.ts` following Next.js App Router conventions.
2. New React components belong in `components/`.
3. Shared utility logic belongs in `lib/utils.ts`; domain-specific modules get their own file under `lib/`.
4. New recommendation engines go under `lib/engines/` and must be registered in `lib/engines/index.ts`.
5. Database schema changes require a migration block inside `initDb()` in `lib/db.ts` (additive `ALTER TABLE` or new table — never destructive).
6. New tab-level views belong in `components/views/` as `<Name>View.tsx`. Smaller reusable UI pieces belong directly in `components/`.
7. Scheduler modules (`cda-scheduler.ts`, `epg-scheduler.ts`) follow the same pattern: export `reschedule*Job(db)` and `run*Now(db)`; manage a single `activeTimer`; read interval from settings; start from `app/layout.tsx` or the relevant route on first use.

## Dependency & Supply-Chain Security

1. **Always commit `pnpm-lock.yaml`.** Never install without a lock file.
2. **Run `pnpm audit` after any dependency change** and resolve high/critical findings before committing.
3. **Only `better-sqlite3`, `esbuild`, and `sharp` are allowed to run install scripts** (`pnpm.onlyBuiltDependencies` in `package.json`). Do not add packages with `postinstall`/`prepare` scripts without explicit user approval.
4. **Never add a new dependency without explicit user approval.** Justify every new dep in the commit message.
5. **Verify new packages before adding:** check npm download counts, publish date, and maintainer history to guard against typosquatting. Flag anything suspicious before installing.

## Scope & Safety Rules

1. **Conventional commits are enforced** by commitlint + husky `commit-msg` hook (not optional). Format: `type(scope): description` — types: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `chore`.
2. **Never commit to a feature branch and force-push master** — this repo deploys automatically on push to `master` via GHA + Watchtower. Every push to master triggers a Docker build and live deployment.
3. **Never commit secrets or `.env` files.** Use `bioenv` for all secrets.
4. **Never modify `data/` contents** (SQLite DB and backups are gitignored and must stay that way).
5. **Schema migrations must be additive.** Never drop columns or tables — the live DB on the server has real user data.
