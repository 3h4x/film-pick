import Database from "better-sqlite3";
import path from "path";

export interface Movie {
  id: number;
  title: string;
  year: number | null;
  genre: string | null;
  director: string | null;
  writer: string | null;
  actors: string | null;
  rating: number | null;
  poster_url: string | null;
  source: string | null;
  imdb_id: string | null;
  tmdb_id: number | null;
  type: string;
  file_path: string | null;
  extra_files: string | null; // JSON array of additional file paths
  created_at: string;
  // Columns added by filmweb import and other optional migrations
  user_rating?: number | null;
  pl_title?: string | null;
  filmweb_id?: string | null;
  filmweb_url?: string | null;
  rated_at?: string | null;
  wishlist?: number | null;
  description?: string | null;
  cda_url?: string | null;
  video_metadata?: string | null;
}

export interface MovieInput {
  title: string;
  year: number | null;
  genre: string | null;
  director: string | null;
  writer?: string | null;
  actors?: string | null;
  rating: number | null;
  poster_url: string | null;
  source: string | null;
  imdb_id: string | null;
  tmdb_id: number | null;
  type: string;
  file_path?: string | null;
  extra_files?: string | null;
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
      file_path TEXT,
      extra_files TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      video_metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Add file_path column if missing (migration)
    CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY);
  `);

  const hasMigration = db
    .prepare("SELECT 1 FROM _migrations WHERE name = 'add_file_path'")
    .get();
  if (!hasMigration) {
    try {
      db.exec("ALTER TABLE movies ADD COLUMN file_path TEXT");
    } catch {
      // Column already exists
    }
    db.prepare(
      "INSERT OR IGNORE INTO _migrations (name) VALUES ('add_file_path')",
    ).run();
  }

  const hasVideoMetadata = db
    .prepare("SELECT 1 FROM _migrations WHERE name = 'add_video_metadata'")
    .get();
  if (!hasVideoMetadata) {
    try {
      db.exec("ALTER TABLE movies ADD COLUMN video_metadata TEXT");
    } catch {
      // Column already exists
    }
    db.prepare(
      "INSERT OR IGNORE INTO _migrations (name) VALUES ('add_video_metadata')",
    ).run();
  }

  const hasCredits = db
    .prepare("SELECT 1 FROM _migrations WHERE name = 'add_credits'")
    .get();
  if (!hasCredits) {
    try {
      db.exec("ALTER TABLE movies ADD COLUMN writer TEXT");
      db.exec("ALTER TABLE movies ADD COLUMN actors TEXT");
    } catch {
      // Column already exists
    }
    db.prepare(
      "INSERT OR IGNORE INTO _migrations (name) VALUES ('add_credits')",
    ).run();
  }

  const hasExtraFiles = db
    .prepare("SELECT 1 FROM _migrations WHERE name = 'add_extra_files'")
    .get();
  if (!hasExtraFiles) {
    try {
      db.exec("ALTER TABLE movies ADD COLUMN extra_files TEXT");
    } catch {
      // Column already exists
    }
    db.prepare(
      "INSERT OR IGNORE INTO _migrations (name) VALUES ('add_extra_files')",
    ).run();
  }

  const hasUserColumns = db
    .prepare("SELECT 1 FROM _migrations WHERE name = 'add_user_columns'")
    .get();
  if (!hasUserColumns) {
    const cols = (db.pragma("table_info(movies)") as { name: string }[]).map((c) => c.name);
    const toAdd: [string, string][] = [
      ["user_rating", "REAL"],
      ["wishlist", "INTEGER DEFAULT 0"],
      ["rated_at", "TEXT"],
      ["pl_title", "TEXT"],
      ["description", "TEXT"],
      ["cda_url", "TEXT"],
      ["filmweb_id", "INTEGER"],
      ["filmweb_url", "TEXT"],
    ];
    for (const [col, type] of toAdd) {
      if (!cols.includes(col)) {
        try {
          db.exec(`ALTER TABLE movies ADD COLUMN ${col} ${type}`);
        } catch {
          // Column already exists
        }
      }
    }
    db.prepare(
      "INSERT OR IGNORE INTO _migrations (name) VALUES ('add_user_columns')",
    ).run();
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS dismissed_recommendations (
      tmdb_id INTEGER PRIMARY KEY,
      dismissed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recommendation_cache (
      engine TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      movie_count INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recommended_movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tmdb_id INTEGER NOT NULL,
      engine TEXT NOT NULL,
      reason TEXT NOT NULL,
      title TEXT NOT NULL,
      year INTEGER,
      genre TEXT,
      rating REAL,
      poster_url TEXT,
      pl_title TEXT,
      cda_url TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tmdb_id, engine)
    );
  `);

  // Migration: add description column to recommended_movies if missing
  const recMovieCols = (
    db.pragma("table_info(recommended_movies)") as { name: string }[]
  ).map((c) => c.name);
  if (!recMovieCols.includes("description")) {
    db.exec("ALTER TABLE recommended_movies ADD COLUMN description TEXT");
  }

  // Migration: old recommendation_cache had 'id' column, new one has 'engine'
  const cacheInfo = db.pragma("table_info(recommendation_cache)") as {
    name: string;
  }[];
  if (
    cacheInfo.some((c) => c.name === "id") &&
    !cacheInfo.some((c) => c.name === "engine")
  ) {
    db.exec("DROP TABLE recommendation_cache");
    db.exec(`CREATE TABLE recommendation_cache (
      engine TEXT PRIMARY KEY, data TEXT NOT NULL, movie_count INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  // Indexes for common query patterns (idempotent — IF NOT EXISTS)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_movies_tmdb_id ON movies (tmdb_id);
    CREATE INDEX IF NOT EXISTS idx_movies_file_path ON movies (file_path);
    CREATE INDEX IF NOT EXISTS idx_movies_user_rating ON movies (user_rating);
    CREATE INDEX IF NOT EXISTS idx_movies_title_year ON movies (title, year);
    CREATE INDEX IF NOT EXISTS idx_movies_type ON movies (type);
    CREATE INDEX IF NOT EXISTS idx_recommended_movies_tmdb_id ON recommended_movies (tmdb_id);
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

// Fills in null/empty metadata fields on an existing row from an incoming MovieInput.
// Only overwrites fields that are currently null or empty — never replaces user data.
function enrichMissingMetadata(
  db: Database.Database,
  id: number,
  existing: { genre: string | null; rating: number | null; poster_url: string | null; imdb_id: string | null; tmdb_id?: number | null },
  incoming: MovieInput,
): void {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (!existing.genre && incoming.genre) { sets.push("genre = ?"); values.push(incoming.genre); }
  if (!existing.rating && incoming.rating) { sets.push("rating = ?"); values.push(incoming.rating); }
  if (!existing.poster_url && incoming.poster_url) { sets.push("poster_url = ?"); values.push(incoming.poster_url); }
  if (!existing.imdb_id && incoming.imdb_id) { sets.push("imdb_id = ?"); values.push(incoming.imdb_id); }
  if ("tmdb_id" in existing && !existing.tmdb_id && incoming.tmdb_id) { sets.push("tmdb_id = ?"); values.push(incoming.tmdb_id); }
  if (sets.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE movies SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function insertMovie(db: Database.Database, movie: MovieInput): number {
  if (movie.file_path) {
    const existing = db
      .prepare("SELECT id FROM movies WHERE file_path = ?")
      .get(movie.file_path) as { id: number } | undefined;
    if (existing) return existing.id;
  }

  // If a movie with the same tmdb_id already exists, link the file to it
  if (movie.tmdb_id) {
    const byTmdbId = db
      .prepare("SELECT id, file_path, extra_files, genre, rating, poster_url, imdb_id FROM movies WHERE tmdb_id = ?")
      .get(movie.tmdb_id) as { id: number; file_path: string | null; extra_files: string | null; genre: string | null; rating: number | null; poster_url: string | null; imdb_id: string | null } | undefined;
    if (byTmdbId) {
      if (movie.file_path) {
        if (!byTmdbId.file_path) {
          // No primary file yet — set it and bump created_at so it sorts to top of "Date Added"
          db.prepare("UPDATE movies SET file_path = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?").run(movie.file_path, byTmdbId.id);
        } else if (byTmdbId.file_path !== movie.file_path) {
          // Already has a different primary file — add to extra_files to avoid overwrite loop
          const extras: string[] = byTmdbId.extra_files ? JSON.parse(byTmdbId.extra_files) : [];
          if (!extras.includes(movie.file_path)) {
            extras.push(movie.file_path);
            db.prepare("UPDATE movies SET extra_files = ? WHERE id = ?").run(JSON.stringify(extras), byTmdbId.id);
          }
        }
      }
      // Fill in missing metadata from the incoming record (e.g. recommendation enriching a scanned entry)
      enrichMissingMetadata(db, byTmdbId.id, byTmdbId, movie);
      return byTmdbId.id;
    }
  }

  // If a movie with the same title+year already exists, return existing id
  // and update file_path if the new entry has one
  if (movie.title) {
    const byTitleYear = db
      .prepare(
        "SELECT id, file_path, extra_files, genre, rating, poster_url, imdb_id, tmdb_id FROM movies WHERE LOWER(title) = LOWER(?) AND year IS ?",
      )
      .get(movie.title, movie.year ?? null) as { id: number; file_path: string | null; extra_files: string | null; genre: string | null; rating: number | null; poster_url: string | null; imdb_id: string | null; tmdb_id: number | null } | undefined;
    if (byTitleYear) {
      if (movie.file_path) {
        if (!byTitleYear.file_path) {
          db.prepare("UPDATE movies SET file_path = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?").run(movie.file_path, byTitleYear.id);
        } else if (byTitleYear.file_path !== movie.file_path) {
          const extras: string[] = byTitleYear.extra_files ? JSON.parse(byTitleYear.extra_files) : [];
          if (!extras.includes(movie.file_path)) {
            extras.push(movie.file_path);
            db.prepare("UPDATE movies SET extra_files = ? WHERE id = ?").run(JSON.stringify(extras), byTitleYear.id);
          }
        }
      }
      // Fill in missing metadata (e.g. tmdb_id, genre, rating) from the incoming record
      enrichMissingMetadata(db, byTitleYear.id, byTitleYear, movie);
      return byTitleYear.id;
    }
  }

  const stmt = db.prepare(`
    INSERT INTO movies (title, year, genre, director, writer, actors, rating, poster_url, source, imdb_id, tmdb_id, type, file_path, extra_files)
    VALUES (@title, @year, @genre, @director, @writer, @actors, @rating, @poster_url, @source, @imdb_id, @tmdb_id, @type, @file_path, @extra_files)
  `);
  const result = stmt.run({
    ...movie,
    writer: movie.writer ?? null,
    actors: movie.actors ?? null,
    file_path: movie.file_path ?? null,
    extra_files: movie.extra_files ?? null,
  });
  return Number(result.lastInsertRowid);
}

const ORDER_BY_USER_RATING =
  "ORDER BY CASE WHEN user_rating IS NOT NULL AND user_rating < 5 THEN 1 ELSE 0 END, user_rating DESC, created_at DESC";

export function getMovies(db: Database.Database, type?: string): Movie[] {
  if (type) {
    return db
      .prepare(`SELECT * FROM movies WHERE type = ? ${ORDER_BY_USER_RATING}`)
      .all(type) as Movie[];
  }
  return db.prepare(`SELECT * FROM movies ${ORDER_BY_USER_RATING}`).all() as Movie[];
}

export function deleteMovie(db: Database.Database, id: number): void {
  db.prepare("DELETE FROM movies WHERE id = ?").run(id);
}

export function getCachedEngine<T = unknown>(
  db: Database.Database,
  engine: string,
  movieCount: number,
  maxAgeHours = 24,
): T[] | null {
  const row = db
    .prepare(
      "SELECT data, movie_count, created_at FROM recommendation_cache WHERE engine = ?",
    )
    .get(engine) as
    | { data: string; movie_count: number; created_at: string }
    | undefined;
  if (!row || row.movie_count !== movieCount) return null;
  const ageMs = Date.now() - new Date(row.created_at + "Z").getTime();
  if (ageMs > maxAgeHours * 60 * 60 * 1000) return null;
  try {
    return JSON.parse(row.data) as T[];
  } catch {
    return null;
  }
}

export function setCachedEngine<T = unknown>(
  db: Database.Database,
  engine: string,
  data: T[],
  movieCount: number,
): void {
  db.prepare(
    "INSERT OR REPLACE INTO recommendation_cache (engine, data, movie_count, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
  ).run(engine, JSON.stringify(data), movieCount);
}

export function clearCachedEngine(
  db: Database.Database,
  engine?: string,
): void {
  if (engine) {
    db.prepare("DELETE FROM recommendation_cache WHERE engine = ?").run(engine);
    db.prepare("DELETE FROM recommended_movies WHERE engine = ?").run(engine);
  } else {
    db.prepare("DELETE FROM recommendation_cache").run();
    db.prepare("DELETE FROM recommended_movies").run();
  }
}

export interface RecommendedMovie {
  id: number;
  tmdb_id: number;
  engine: string;
  reason: string;
  title: string;
  year: number | null;
  genre: string | null;
  rating: number | null;
  poster_url: string | null;
  pl_title: string | null;
  cda_url: string | null;
  description: string | null;
  created_at: string;
}

export function saveRecommendedMovies(
  db: Database.Database,
  engine: string,
  reason: string,
  movies: {
    tmdb_id: number;
    title: string;
    year: number | null;
    genre: string | null;
    rating: number | null;
    poster_url: string | null;
  }[],
): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO recommended_movies (tmdb_id, engine, reason, title, year, genre, rating, poster_url)
    VALUES (@tmdb_id, @engine, @reason, @title, @year, @genre, @rating, @poster_url)
  `);
  for (const m of movies) {
    stmt.run({ ...m, engine, reason });
  }
}

export function pruneRecommendedMovies(
  db: Database.Database,
  engine: string,
  keepTmdbIds: number[],
): void {
  if (keepTmdbIds.length === 0) {
    db.prepare("DELETE FROM recommended_movies WHERE engine = ?").run(engine);
    return;
  }
  const placeholders = keepTmdbIds.map(() => "?").join(", ");
  db.prepare(
    `DELETE FROM recommended_movies WHERE engine = ? AND tmdb_id NOT IN (${placeholders})`,
  ).run(engine, ...keepTmdbIds);
}

export function getRecommendedMovies(
  db: Database.Database,
  engine?: string,
): RecommendedMovie[] {
  // Prefer a TMDb poster from the movies table over whatever was stored at scrape time
  // (CDA thumbnails look bad; auto-link updates movies.poster_url to TMDb quality).
  const cols = `
    rm.id, rm.tmdb_id, rm.engine, rm.reason, rm.title, rm.year, rm.genre, rm.rating,
    COALESCE(
      (SELECT m.poster_url FROM movies m
       WHERE m.tmdb_id = rm.tmdb_id AND m.poster_url LIKE 'https://image.tmdb.org%'
       LIMIT 1),
      rm.poster_url
    ) AS poster_url,
    rm.pl_title, rm.cda_url, rm.description, rm.created_at
  `;
  if (engine) {
    return db
      .prepare(`SELECT ${cols} FROM recommended_movies rm WHERE rm.engine = ? ORDER BY rm.rating DESC`)
      .all(engine) as RecommendedMovie[];
  }
  return db
    .prepare(`SELECT ${cols} FROM recommended_movies rm ORDER BY rm.engine, rm.rating DESC`)
    .all() as RecommendedMovie[];
}

export function updateRecommendedMovie(
  db: Database.Database,
  tmdbId: number,
  updates: { pl_title?: string; cda_url?: string; description?: string },
): void {
  if (updates.pl_title) {
    db.prepare(
      "UPDATE recommended_movies SET pl_title = ? WHERE tmdb_id = ?",
    ).run(updates.pl_title, tmdbId);
  }
  if (updates.cda_url) {
    db.prepare(
      "UPDATE recommended_movies SET cda_url = ? WHERE tmdb_id = ?",
    ).run(updates.cda_url, tmdbId);
  }
  if (updates.description) {
    db.prepare(
      "UPDATE recommended_movies SET description = ? WHERE tmdb_id = ?",
    ).run(updates.description, tmdbId);
  }
}

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(
  db: Database.Database,
  key: string,
  value: string,
): void {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    key,
    value,
  );
}

export function getMovieByFilePath(
  db: Database.Database,
  filePath: string,
): Movie | null {
  return (
    (db
      .prepare("SELECT * FROM movies WHERE file_path = ?")
      .get(filePath) as Movie) ?? null
  );
}

export function dismissRecommendation(
  db: Database.Database,
  tmdbId: number,
): void {
  db.prepare(
    "INSERT OR IGNORE INTO dismissed_recommendations (tmdb_id) VALUES (?)",
  ).run(tmdbId);
}

export function getDismissedIds(db: Database.Database): Set<number> {
  const rows = db
    .prepare("SELECT tmdb_id FROM dismissed_recommendations")
    .all() as { tmdb_id: number }[];
  return new Set(rows.map((r) => r.tmdb_id));
}
