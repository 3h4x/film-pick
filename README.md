# Movies Organizer

Movie and TV series recommendation system with a Next.js web UI and SQLite database. Includes a Python CLI tool for bulk renaming/organizing media files.

## Web App

```bash
cd web
pnpm install
eval "$(bioenv load)"    # Load TMDB_API_KEY
pnpm dev                 # http://localhost:4000
```

### Features

- **Library** — browse your collection with posters, personal + global ratings, search, sort (6 options), genre filter, pagination
- **Recommendations** — genre-based, director/actor-based, and per-movie suggestions from TMDb
- **Import** — scan a local directory for video files, or import Filmweb ratings export
- **Sync** — re-scan library path to detect added/removed files
- **Actions** on recommendations: liked, watched, disliked, dismiss

### Tech Stack

Next.js 16, React 19, TypeScript, Tailwind CSS 4, SQLite (better-sqlite3), TMDb API, Filmweb import

## CLI Tool

Python CLI for bulk renaming and organizing movie/series files using IMDb metadata.

```bash
cd src && pip install -r requirements.txt
python movies_organizer.py movies -p /path/to/movies
python movies_organizer.py series -p /path/to/series
```

## License

See [LICENSE.md](LICENSE.md)
