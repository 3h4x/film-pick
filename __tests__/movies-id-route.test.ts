import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, insertMovie } from "@/lib/db";

// Mock heavy external dependencies — the PATCH/DELETE handlers don't use them,
// but the GET handler does; mocking avoids side-effects when the module loads.
vi.mock("@/lib/tmdb", () => ({
  getTmdbMovieDetails: vi.fn(),
  searchTmdb: vi.fn().mockResolvedValue([]),
  getMovieLocalized: vi.fn().mockResolvedValue({ pl_title: null, description: null }),
}));

vi.mock("child_process", () => ({
  execFile: vi.fn((_cmd: string, _args: string[], cb: (err: null, stdout: string, stderr: string) => void) => cb(null, "{}", "")),
}));

vi.mock("util", async (importOriginal) => {
  const actual = await importOriginal<typeof import("util")>();
  return {
    ...actual,
    promisify: vi.fn(() =>
      vi.fn<() => Promise<never>>().mockRejectedValue(new Error("ffprobe not available in tests")),
    ),
  };
});

// Patch only getDb so the handler uses our in-memory database.
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { GET, PATCH, DELETE } from "@/app/api/movies/[id]/route";
import { getDb } from "@/lib/db";
import { getTmdbMovieDetails, searchTmdb, getMovieLocalized } from "@/lib/tmdb";

const TEST_DB = path.join(__dirname, "test-movies-id-route.db");

function makeParams(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function patchReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/movies/1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("movies/[id] PATCH handler", () => {
  let db: Database.Database;
  let movieId: number;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);

    movieId = insertMovie(db, {
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
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
  });

  it("updates user_rating and returns the updated movie", async () => {
    const res = await PATCH(patchReq({ user_rating: 9 }), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user_rating).toBe(9);
    expect(body.id).toBe(movieId);
  });

  it("auto-sets rated_at when user_rating is provided without rated_at", async () => {
    const before = Date.now();
    const res = await PATCH(patchReq({ user_rating: 7 }), makeParams(movieId));
    const after = Date.now();
    expect(res.status).toBe(200);
    const body = await res.json();
    const ratedAt = new Date(body.rated_at).getTime();
    expect(ratedAt).toBeGreaterThanOrEqual(before);
    expect(ratedAt).toBeLessThanOrEqual(after + 1000);
  });

  it("clears rated_at when user_rating is set to null", async () => {
    // First give it a rating.
    await PATCH(patchReq({ user_rating: 7 }), makeParams(movieId));
    // Now clear it.
    const res = await PATCH(patchReq({ user_rating: null }), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user_rating).toBeNull();
    expect(body.rated_at).toBeNull();
  });

  it("respects an explicit rated_at value when provided alongside user_rating", async () => {
    const explicit = "2024-06-15T12:00:00.000Z";
    const res = await PATCH(
      patchReq({ user_rating: 8, rated_at: explicit }),
      makeParams(movieId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rated_at).toBe(explicit);
  });

  it("updates multiple allowed fields in one request", async () => {
    const res = await PATCH(
      patchReq({ title: "Inception (2010)", year: 2010, genre: "Sci-Fi, Thriller" }),
      makeParams(movieId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Inception (2010)");
    expect(body.genre).toBe("Sci-Fi, Thriller");
  });

  it("returns 400 when no valid fields are provided", async () => {
    const res = await PATCH(
      patchReq({ unknown_field: "value", another_bad: 123 }),
      makeParams(movieId),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no valid fields/i);
  });

  it("returns 404 for a non-existent movie id", async () => {
    const res = await PATCH(patchReq({ user_rating: 5 }), makeParams(99999));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("ignores non-allowlisted fields in a mixed request", async () => {
    const res = await PATCH(
      patchReq({ user_rating: 6, malicious_field: "DROP TABLE movies" }),
      makeParams(movieId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user_rating).toBe(6);
    // Confirm malicious_field was not persisted.
    expect(body).not.toHaveProperty("malicious_field");
  });

  it("sets wishlist flag via PATCH", async () => {
    const res = await PATCH(patchReq({ wishlist: 1 }), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wishlist).toBe(1);

    const row = db.prepare("SELECT wishlist FROM movies WHERE id = ?").get(movieId) as { wishlist: number };
    expect(row.wishlist).toBe(1);
  });

  it("clears wishlist flag via PATCH", async () => {
    db.prepare("UPDATE movies SET wishlist = 1 WHERE id = ?").run(movieId);

    const res = await PATCH(patchReq({ wishlist: 0 }), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wishlist).toBe(0);
  });
});

describe("movies/[id] DELETE handler", () => {
  let db: Database.Database;
  let movieId: number;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);

    movieId = insertMovie(db, {
      title: "The Matrix",
      year: 1999,
      genre: "Sci-Fi",
      director: "The Wachowskis",
      rating: 8.7,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 603,
      type: "movie",
    });
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
  });

  it("deletes the movie and returns { ok: true }", async () => {
    const req = new NextRequest(`http://localhost/api/movies/${movieId}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    // Confirm it's gone from the DB.
    const row = db.prepare("SELECT * FROM movies WHERE id = ?").get(movieId);
    expect(row).toBeUndefined();
  });

  it("returns { ok: true } even for a non-existent id (idempotent)", async () => {
    const req = new NextRequest("http://localhost/api/movies/99999", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams(99999));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});

describe("movies/[id] GET handler", () => {
  let db: Database.Database;
  let movieId: number;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);

    movieId = insertMovie(db, {
      title: "Interstellar",
      year: 2014,
      genre: "Sci-Fi",
      director: null,
      rating: 8.6,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: 157336,
      type: "movie",
    });
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
  });

  function getReq(id: number) {
    return new NextRequest(`http://localhost/api/movies/${id}`);
  }

  it("returns 404 for a non-existent movie", async () => {
    const res = await GET(getReq(99999), makeParams(99999));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns movie data with null metadata when file_path is absent", async () => {
    // getTmdbMovieDetails returns credits so enrichment runs
    vi.mocked(getTmdbMovieDetails).mockResolvedValueOnce({
      director: "Christopher Nolan",
      writer: "Christopher Nolan",
      actors: "Matthew McConaughey",
    });

    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movie.title).toBe("Interstellar");
    expect(body.metadata).toBeNull();
  });

  it("returns parsed video_metadata from cached DB field", async () => {
    const cached = { format: "Matroska", duration: 10020, video: { codec: "h264" }, audio: [] };
    db.prepare("UPDATE movies SET video_metadata = ? WHERE id = ?").run(
      JSON.stringify(cached),
      movieId,
    );

    vi.mocked(getTmdbMovieDetails).mockResolvedValueOnce({
      director: "Christopher Nolan",
      writer: null,
      actors: null,
    });

    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metadata).toMatchObject({ format: "Matroska", duration: 10020 });
  });

  it("enriches movie with TMDb credits when director is missing", async () => {
    vi.mocked(getTmdbMovieDetails).mockResolvedValueOnce({
      director: "Christopher Nolan",
      writer: "Christopher Nolan",
      actors: "Matthew McConaughey, Anne Hathaway",
    });

    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movie.director).toBe("Christopher Nolan");
    expect(body.movie.actors).toBe("Matthew McConaughey, Anne Hathaway");

    // Verify the credits were persisted to the DB
    const row = db.prepare("SELECT director, writer, actors FROM movies WHERE id = ?").get(movieId) as any;
    expect(row.director).toBe("Christopher Nolan");
    expect(row.actors).toBe("Matthew McConaughey, Anne Hathaway");
  });

  it("skips credits enrichment when director, writer, and actors are all set", async () => {
    db.prepare(
      "UPDATE movies SET director = ?, writer = ?, actors = ? WHERE id = ?",
    ).run("Christopher Nolan", "Christopher Nolan", "Matthew McConaughey", movieId);

    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    expect(vi.mocked(getTmdbMovieDetails)).not.toHaveBeenCalled();
  });

  it("auto-links TMDb when tmdb_id is null and searchTmdb finds a match", async () => {
    // Insert a movie without tmdb_id
    const unlinkId = insertMovie(db, {
      title: "Dune",
      year: 2021,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    vi.mocked(searchTmdb).mockResolvedValueOnce([
      {
        tmdb_id: 438631,
        title: "Dune",
        year: 2021,
        genre: "Sci-Fi",
        rating: 7.9,
        poster_url: "/poster.jpg",
        imdb_id: "tt1160419",
      },
    ]);
    vi.mocked(getMovieLocalized).mockResolvedValueOnce({
      pl_title: "Diuna",
      description: "Epic sci-fi saga.",
    });

    const res = await GET(getReq(unlinkId), makeParams(unlinkId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movie.tmdb_id).toBe(438631);
    expect(body.movie.pl_title).toBe("Diuna");
    expect(body.movie.source).toBe("tmdb");

    // Verify persisted to DB
    const row = db.prepare("SELECT tmdb_id, pl_title, source FROM movies WHERE id = ?").get(unlinkId) as any;
    expect(row.tmdb_id).toBe(438631);
    expect(row.source).toBe("tmdb");
  });

  it("skips auto-link when searchTmdb returns no results", async () => {
    const unlinkId = insertMovie(db, {
      title: "Obscure Film",
      year: 1985,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    // searchTmdb is already mocked to return [] by default
    const res = await GET(getReq(unlinkId), makeParams(unlinkId));
    expect(res.status).toBe(200);
    const body = await res.json();
    // tmdb_id should remain null
    expect(body.movie.tmdb_id).toBeNull();
    expect(vi.mocked(getTmdbMovieDetails)).not.toHaveBeenCalled();
  });

  it("falls back to results[0] when no exact title match during auto-link", async () => {
    const unlinkId = insertMovie(db, {
      title: "Blade Runner",
      year: 1982,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    // Return a result whose normalized title differs from the movie title
    vi.mocked(searchTmdb).mockResolvedValueOnce([
      {
        tmdb_id: 78,
        title: "Blade Runner 2049",
        year: 2017,
        genre: "Sci-Fi",
        rating: 7.5,
        poster_url: "/br2049.jpg",
        imdb_id: "tt1856101",
      },
    ]);
    vi.mocked(getMovieLocalized).mockResolvedValueOnce({
      pl_title: "Łowca androidów 2049",
      description: "Sequel.",
    });

    const res = await GET(getReq(unlinkId), makeParams(unlinkId));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Should have used results[0] as fallback
    expect(body.movie.tmdb_id).toBe(78);
    expect(body.movie.title).toBe("Blade Runner 2049");
    expect(body.movie.pl_title).toBe("Łowca androidów 2049");
    expect(body.movie.source).toBe("tmdb");
  });

  it("skips auto-link when getMovieLocalized throws", async () => {
    const unlinkId = insertMovie(db, {
      title: "Casablanca",
      year: 1942,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    vi.mocked(searchTmdb).mockResolvedValueOnce([
      {
        tmdb_id: 289,
        title: "Casablanca",
        year: 1942,
        genre: "Drama",
        rating: 8.5,
        poster_url: "/casa.jpg",
        imdb_id: "tt0034583",
      },
    ]);
    vi.mocked(getMovieLocalized).mockRejectedValueOnce(new Error("localization service unavailable"));

    const res = await GET(getReq(unlinkId), makeParams(unlinkId));
    expect(res.status).toBe(200);
    const body = await res.json();
    // auto-link skipped due to error; tmdb_id stays null
    expect(body.movie.tmdb_id).toBeNull();
    expect(body.movie.source).toBe("manual");
  });

  it("returns metadata error object when file exists but ffprobe fails", async () => {
    // Use the TEST_DB path as a stand-in for a real existing file.
    // The promisify mock always rejects, so ffprobe throws → metadata error.
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(TEST_DB, movieId);

    vi.mocked(getTmdbMovieDetails).mockResolvedValueOnce({
      director: "Christopher Nolan",
      writer: null,
      actors: null,
    });

    const res = await GET(getReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metadata).toMatchObject({ error: expect.stringContaining("ffprobe") });
  });
});
