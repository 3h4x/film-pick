import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, insertMovie } from "@/lib/db";

const { mockExistsSync, mockMkdir, mockRename, mockReaddir, mockRm } =
  vi.hoisted(() => ({
    mockExistsSync: vi.fn(),
    mockMkdir: vi.fn(),
    mockRename: vi.fn(),
    mockReaddir: vi.fn(),
    mockRm: vi.fn(),
  }));

vi.mock("fs/promises", () => ({
  default: {
    mkdir: mockMkdir,
    rename: mockRename,
    readdir: mockReaddir,
    rm: mockRm,
  },
  mkdir: mockMkdir,
  rename: mockRename,
  readdir: mockReaddir,
  rm: mockRm,
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: mockExistsSync,
    },
    existsSync: mockExistsSync,
  };
});

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { POST } from "@/app/api/movies/[id]/standardize/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-standardize-api.db");

function makeParams(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function postReq(id: number, qs?: string) {
  const url = `http://localhost/api/movies/${id}/standardize${qs ? `?${qs}` : ""}`;
  return new NextRequest(url, { method: "POST" });
}

describe("movies/[id]/standardize POST handler", () => {
  let db: Database.Database;
  let movieId: number;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
    mockReaddir.mockResolvedValue([]);
    mockRm.mockResolvedValue(undefined);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(TEST_DB); } catch {}
  });

  it("returns 404 when movie is not found", async () => {
    const res = await POST(postReq(99999), makeParams(99999));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 400 when movie has no file_path", async () => {
    movieId = insertMovie(db, {
      title: "No Path",
      year: 2020,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no file path/i);
  });

  it("returns 404 with FILE_NOT_FOUND code when file is missing from disk", async () => {
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      "/library/old_folder/inception_old.mkv",
      movieId,
    );

    mockExistsSync.mockReturnValue(false);

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("FILE_NOT_FOUND");
  });

  it("removes DB entry when file is missing and delete_missing=true", async () => {
    movieId = insertMovie(db, {
      title: "Ghost Film",
      year: 2015,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "manual",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      "/library/ghost_folder/Ghost Film.mkv",
      movieId,
    );

    mockExistsSync.mockReturnValue(false);

    const res = await POST(
      postReq(movieId, "delete_missing=true"),
      makeParams(movieId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const row = db.prepare("SELECT * FROM movies WHERE id = ?").get(movieId);
    expect(row).toBeUndefined();
  });

  it("returns ok with 'already standard' when path matches standard format", async () => {
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    // Path already matches standard format: Title [Year]/Title.ext
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      "/library/Inception [2010]/Inception.mkv",
      movieId,
    );

    // existsSync(oldPath) must return true to proceed past the missing-file check
    mockExistsSync.mockImplementation((p: string) =>
      p === "/library/Inception [2010]/Inception.mkv",
    );

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toMatch(/already standard/i);
  });

  it("moves file and updates DB when path is not standard", async () => {
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    const oldPath = "/library/old_folder/inception_1080p.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      oldPath,
      movieId,
    );

    const expectedNewPath = "/library/Inception [2010]/Inception.mkv";
    mockExistsSync.mockImplementation((p: string) => p === oldPath);

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.newPath).toBe(expectedNewPath);
    expect(body.newTitle).toBe("Inception");

    const row = db
      .prepare("SELECT file_path, title, year FROM movies WHERE id = ?")
      .get(movieId) as any;
    expect(row.file_path).toBe(expectedNewPath);
    expect(row.title).toBe("Inception");
    expect(row.year).toBe(2010);

    expect(mockMkdir).toHaveBeenCalledWith(
      "/library/Inception [2010]",
      expect.objectContaining({ recursive: true }),
    );
    expect(mockRename).toHaveBeenCalledWith(oldPath, expectedNewPath);
  });

  it("returns 409 when target file already exists on disk (collision)", async () => {
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    const oldPath = "/library/old_folder/inception_1080p.mkv";
    const newPath = "/library/Inception [2010]/Inception.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      oldPath,
      movieId,
    );

    // Both old and new paths exist → collision
    mockExistsSync.mockImplementation(
      (p: string) => p === oldPath || p === newPath,
    );

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
  });

  it("uses library_path setting as root when configured", async () => {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
      "library_path",
      "/mnt/media/Movies",
    );

    movieId = insertMovie(db, {
      title: "Dune",
      year: 2021,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 438631,
      type: "movie",
    });
    const oldPath = "/mnt/media/Movies/dune_2021_bluray/dune.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      oldPath,
      movieId,
    );

    const expectedNewPath = "/mnt/media/Movies/Dune [2021]/Dune.mkv";
    mockExistsSync.mockImplementation((p: string) => p === oldPath);

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.newPath).toBe(expectedNewPath);

    expect(mockMkdir).toHaveBeenCalledWith(
      "/mnt/media/Movies/Dune [2021]",
      expect.objectContaining({ recursive: true }),
    );
  });

  it("recovers when file already at standard path but DB not updated", async () => {
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    const oldPath = "/library/old_folder/inception_1080p.mkv";
    const expectedNewPath = "/library/Inception [2010]/Inception.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(
      oldPath,
      movieId,
    );

    // old path missing but new path exists (partial move, DB not updated)
    mockExistsSync.mockImplementation((p: string) => p === expectedNewPath);

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const row = db
      .prepare("SELECT file_path FROM movies WHERE id = ?")
      .get(movieId) as any;
    expect(row.file_path).toBe(expectedNewPath);
  });

  it("removes placeholder (no file_path) conflict entry and continues standardization", async () => {
    // Insert the movie to standardize (noisy title → cleans to "Inception")
    movieId = insertMovie(db, {
      title: "Inception 1080p BluRay",
      year: 2010,
      genre: null,
      director: null,
      rating: 8.8,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    const oldPath = "/library/old_folder/Inception.1080p.BluRay.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(oldPath, movieId);

    // Insert a placeholder with the CLEAN title (same as what standardize will resolve to)
    // and no file_path. Use a different tmdb_id to avoid insertMovie deduplication.
    db.prepare(
      "INSERT INTO movies (title, year, genre, director, rating, source, type, file_path) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
    ).run("Inception", 2010, "Sci-Fi", "Christopher Nolan", 8.8, "recommendation", "movie");
    const placeholderRow = db
      .prepare("SELECT id FROM movies WHERE title = 'Inception' AND type = 'movie'")
      .get() as { id: number };
    const placeholderId = placeholderRow.id;

    const expectedNewPath = "/library/Inception [2010]/Inception.mkv";
    mockExistsSync.mockImplementation((p: string) => p === oldPath);

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.newPath).toBe(expectedNewPath);

    // Placeholder should be deleted
    const placeholder = db.prepare("SELECT id FROM movies WHERE id = ?").get(placeholderId);
    expect(placeholder).toBeUndefined();

    // Main movie should have been moved
    const row = db
      .prepare("SELECT file_path, title FROM movies WHERE id = ?")
      .get(movieId) as any;
    expect(row.file_path).toBe(expectedNewPath);
    expect(row.title).toBe("Inception");
  });

  it("removes phantom conflict (file_path set but file missing on disk) and continues", async () => {
    movieId = insertMovie(db, {
      title: "Inception 4K Remux",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "local",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    const oldPath = "/library/old_4k/Inception.4K.REMUX.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(oldPath, movieId);

    // Insert a conflict with a stale file_path that no longer exists on disk
    const phantomId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "local",
      imdb_id: null,
      tmdb_id: null,
      type: "movie",
    });
    const phantomPath = "/library/Inception [2010]/Inception.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(phantomPath, phantomId);

    const expectedNewPath = "/library/Inception [2010]/Inception.mkv";

    // Old path exists; phantom path does NOT exist
    mockExistsSync.mockImplementation((p: string) => p === oldPath);

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.newPath).toBe(expectedNewPath);

    // Phantom conflict should be deleted
    const phantom = db.prepare("SELECT id FROM movies WHERE id = ?").get(phantomId);
    expect(phantom).toBeUndefined();

    // Main movie gets updated path
    const row = db
      .prepare("SELECT file_path FROM movies WHERE id = ?")
      .get(movieId) as any;
    expect(row.file_path).toBe(expectedNewPath);
  });

  it("moves subtitle files alongside the movie file", async () => {
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    const oldPath = "/library/old_folder/inception_1080p.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(oldPath, movieId);

    const expectedNewPath = "/library/Inception [2010]/Inception.mkv";
    mockExistsSync.mockImplementation((p: string) => p === oldPath);
    // readdir returns the original movie file plus a subtitle file
    mockReaddir.mockResolvedValue(["inception_1080p.mkv", "inception_1080p.srt"]);

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.newPath).toBe(expectedNewPath);

    // Subtitle should have been moved (renamed to .srt under new dir)
    const renameCalls = mockRename.mock.calls as [string, string][];
    const subCall = renameCalls.find(([, dst]) => dst.endsWith(".srt"));
    expect(subCall).toBeDefined();
    expect(subCall![0]).toBe("/library/old_folder/inception_1080p.srt");
    expect(subCall![1]).toBe("/library/Inception [2010]/Inception.srt");
  });

  it("deletes old directory after moving file to standard path", async () => {
    movieId = insertMovie(db, {
      title: "Inception",
      year: 2010,
      genre: null,
      director: null,
      rating: null,
      poster_url: null,
      source: "tmdb",
      imdb_id: null,
      tmdb_id: 27205,
      type: "movie",
    });
    const oldPath = "/library/old_noisy_folder/inception_1080p.mkv";
    db.prepare("UPDATE movies SET file_path = ? WHERE id = ?").run(oldPath, movieId);

    mockExistsSync.mockImplementation((p: string) => p === oldPath);
    // readdir returns empty (no extra files to stat), so getDirSize returns 0 → eligible for deletion
    mockReaddir.mockResolvedValue([]);

    const res = await POST(postReq(movieId), makeParams(movieId));
    expect(res.status).toBe(200);

    expect(mockRm).toHaveBeenCalledWith(
      "/library/old_noisy_folder",
      expect.objectContaining({ recursive: true, force: true }),
    );
  });
});
