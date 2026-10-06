import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { initDb, setSetting } from "@/lib/db";
import { clearStandardizeJobs } from "@/lib/standardize-jobs";

vi.mock("@/lib/subtitle-download", () => ({ fetchMovieSubtitles: vi.fn() }));

import { fetchMovieSubtitles } from "@/lib/subtitle-download";
import { markFilesForPostprocess, postprocessNewFiles } from "@/lib/sync-postprocess";

const TEST_DB = path.join(__dirname, "test-sync-postprocess.db");
const HOUR = 60 * 60 * 1000;

describe("sync post-processing (standardize + subtitles for new files)", () => {
  let db: Database.Database;
  let library: string;

  function addFile(relative: string, ageMs = HOUR): string {
    const filePath = path.join(library, relative);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "video");
    const at = new Date(Date.now() - ageMs);
    fs.utimesSync(filePath, at, at);
    return filePath;
  }

  function addMovie(title: string, year: number, filePath: string | null): number {
    return db
      .prepare(
        "INSERT INTO movies (title, year, type, source, tmdb_id, file_path) VALUES (?, ?, 'movie', 'tmdb', NULL, ?)",
      )
      .run(title, year, filePath).lastInsertRowid as number;
  }

  const row = (id: number) =>
    db.prepare("SELECT file_path, sync_processed_at FROM movies WHERE id = ?").get(id) as {
      file_path: string | null;
      sync_processed_at: number | null;
    };

  beforeEach(() => {
    library = fs.mkdtempSync(path.join(os.tmpdir(), "filmpick-postprocess-"));
    db = new Database(TEST_DB);
    initDb(db);
    setSetting(db, "library_path", library);
    vi.mocked(fetchMovieSubtitles).mockResolvedValue({ status: "not_found" });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(fetchMovieSubtitles).mockReset();
    clearStandardizeJobs();
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    fs.rmSync(library, { recursive: true, force: true });
  });

  it("the migration stamps rows that already exist, so the current library is never touched", () => {
    const id = addMovie("Sample Movie", 1999, addFile("old/Sample.Movie.1999.mkv"));
    db.prepare("UPDATE movies SET sync_processed_at = 123 WHERE id = ?").run(id);
    db.prepare("DELETE FROM _migrations WHERE name = 'add_sync_processed_at'").run();
    db.prepare("UPDATE movies SET sync_processed_at = NULL").run();

    initDb(db);

    expect(row(id).sync_processed_at).not.toBeNull();
  });

  it("moves a new file into the standard layout, fetches subtitles for the new path, and marks it done", async () => {
    const original = addFile("Downloads/Sample.Movie.1999.1080p.WEBRip/Sample.Movie.1999.1080p.WEBRip.mkv");
    const id = addMovie("Sample Movie", 1999, original);
    vi.mocked(fetchMovieSubtitles).mockResolvedValue({
      status: "downloaded", provider: "napiprojekt", hashMatch: true, fileName: "Sample Movie.srt",
      path: "x", format: "srt", converted: false, cueCount: 10, adCuesRemoved: 0,
    });

    const result = await postprocessNewFiles(db, { delayMs: 0 });

    const expected = path.join(library, "Sample Movie [1999]", "Sample Movie.mkv");
    expect(result).toMatchObject({ processed: 1, standardized: 1, subtitles: 1, waiting: 0, failed: 0 });
    expect(row(id).file_path).toBe(expected);
    expect(fs.existsSync(expected)).toBe(true);
    expect(fs.existsSync(original)).toBe(false);
    // looked up for the row after the move, so the subtitle lands next to the new path
    expect(vi.mocked(fetchMovieSubtitles).mock.calls[0][1]).toBe(id);
    expect(row(id).sync_processed_at).not.toBeNull();
  });

  it("leaves a file that is still being written for the next sync", async () => {
    const id = addMovie("Sample Movie", 1999, addFile("Downloads/Sample.Movie.1999.mkv", 60 * 1000));

    const result = await postprocessNewFiles(db, { delayMs: 0 });

    expect(result).toMatchObject({ processed: 0, waiting: 1 });
    expect(row(id).sync_processed_at).toBeNull();
    expect(fetchMovieSubtitles).not.toHaveBeenCalled();
  });

  it("respects the Config switches but still marks the file done", async () => {
    setSetting(db, "sync_auto_standardize", "false");
    setSetting(db, "sync_auto_subtitles", "false");
    const original = addFile("Downloads/Sample.Movie.1999.mkv");
    const id = addMovie("Sample Movie", 1999, original);

    const result = await postprocessNewFiles(db, { delayMs: 0 });

    expect(result).toMatchObject({ processed: 1, standardized: 0, subtitles: 0 });
    expect(row(id).file_path).toBe(original);
    expect(fetchMovieSubtitles).not.toHaveBeenCalled();
    expect(row(id).sync_processed_at).not.toBeNull();
  });

  it("only touches rows marked as new; markFilesForPostprocess marks a linked file", async () => {
    const stamped = addFile("Old Film [2001]/Old Film.mkv");
    const id = addMovie("Old Film", 2001, stamped);
    db.prepare("UPDATE movies SET sync_processed_at = 1 WHERE id = ?").run(id);

    expect((await postprocessNewFiles(db, { delayMs: 0 })).processed).toBe(0);

    markFilesForPostprocess(db, [stamped]);
    expect(row(id).sync_processed_at).toBeNull();
    const result = await postprocessNewFiles(db, { delayMs: 0 });
    expect(result.processed).toBe(1);
    // already standard: nothing moved, subtitles still looked up
    expect(row(id).file_path).toBe(stamped);
    expect(fetchMovieSubtitles).toHaveBeenCalledTimes(1);
  });

  it("counts a failed step but does not retry the file on every sync", async () => {
    vi.mocked(fetchMovieSubtitles).mockResolvedValue({ status: "error", error: "provider down" });
    const id = addMovie("Sample Movie", 1999, addFile("Downloads/Sample.Movie.1999.mkv"));

    const result = await postprocessNewFiles(db, { delayMs: 0 });

    expect(result).toMatchObject({ processed: 1, failed: 1 });
    expect(row(id).sync_processed_at).not.toBeNull();
  });
});
