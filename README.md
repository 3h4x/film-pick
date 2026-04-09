<p align="center">
  <img src="logo.png" alt="FilmPick" width="200" />
</p>

<h1 align="center">FilmPick</h1>

<p align="center">Your personal movie discovery engine. Tracks what you watch, learns what you love, and finds what to watch next.</p>

## Why

Streaming platforms recommend what they want you to watch. This recommends what *you* actually want — based on your ratings, your favorite directors, your favorite actors, and your genre preferences. Everything runs locally. Your taste stays yours.

## Features

### Smart Recommendations

Seven recommendation engines, all powered by your personal ratings:

- **By Director** — loved 3 Villeneuve films? Here's every other movie he directed
- **By Actor** — tracks which actors keep showing up in your highest-rated movies
- **By Genre** — weighs genres by how you actually rate them, not just what you watch
- **Similar Movies** — seeds from your top-rated films via TMDb's recommendation API
- **Hidden Gems** — underrated movies (high TMDb score, low vote count) you'd never find browsing
- **Blockbusters** — popular, well-rated movies you somehow missed
- **Surprise Me** — random discovery when you don't know what you're in the mood for

All engines automatically exclude movies you've already seen, dismissed, or added to your library.

### Person Intelligence

Tracks and ranks directors, writers, and actors based on your watch history. See who you consistently rate highest, discover patterns in your taste, and drill down into any person's filmography filtered through your preferences.

### Library Management

- **Filesystem import** — point it at a directory, it scans for video files, parses titles and years from filenames, and fetches metadata from TMDb
- **Filmweb import** — bring in your ratings history from Poland's biggest movie site
- **TMDb search** — manually add any movie
- **Sync** — re-scan your library path to pick up new files and clean up deleted ones
- **Subtitles** — automatic detection of subtitle files, direct link to OpenSubtitles.com, and drop-to-add that renames and organizes subtitles to match your movie files

### Wishlist

Save recommendations for later. Separate from your watched library — a curated "watch next" list.

### Polish Language Support

Polish titles, Filmweb integration, and CDA Premium streaming links for movies available on the platform.

<!-- screenshot -->

## Quick Start

```bash
pnpm install
pnpm dev          # http://localhost:4000
```

A TMDb API key is required for search and recommendations. Two options:

**Option A: Config UI** — paste your key in the Config tab. Stored in plaintext in the local SQLite database. Quick to set up, but less secure.

**Option B: [bioenv](https://github.com/3h4x/bioenv)** (recommended) — biometric-protected env vars using macOS Touch ID + Keychain. The key never touches disk in plaintext.

```bash
bioenv set TMDB_API_KEY <your-tmdb-read-access-token>
eval "$(bioenv load)"    # Touch ID prompt, then start dev server
pnpm dev
```

Environment variable takes priority over the database setting.

## Docker

```bash
docker pull ghcr.io/3h4x/film-pick:master
```

Run with docker-compose:

```bash
echo "TMDB_API_KEY=your-key" > .env
docker compose up -d    # http://localhost:4000
```

SQLite data is persisted in `./data/` via volume mount.

## Tech Stack

Next.js 16 | React 19 | TypeScript | SQLite | Tailwind CSS 4 | TMDb API

## License

See [LICENSE.md](LICENSE.md)
