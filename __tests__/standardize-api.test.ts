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
});
