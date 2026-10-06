import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { initDb, setSetting } from "@/lib/db";

vi.mock("@/lib/subtitle-download", () => ({ fetchMovieSubtitles: vi.fn() }));

import { fetchMovieSubtitles } from "@/lib/subtitle-download";
import {
  dueSubtitleChecks,
  ERROR_RETRY_DAYS,
  NOT_FOUND_RETRY_DAYS,
  runSubtitleBatch,
} from "@/lib/subtitle-scheduler";

const TEST_DB = path.join(__dirname, "test-subtitle-scheduler.db");
const DAY = 86400;

describe("background subtitle lookups", () => {
  let db: Database.Database;
  let dir: string;
  const NOW = Date.UTC(2026, 9, 6, 12) as number;
  const nowS = Math.floor(NOW / 1000);

  function addMovie(name: string, check: { at: number; status: string } | null = null, ageMs = 60 * 60 * 1000) {
    const filePath = path.join(dir, `${name}.mkv`);
    fs.writeFileSync(filePath, "video");
    const t = new Date(NOW - ageMs);
    fs.utimesSync(filePath, t, t);
    return db
      .prepare(
        "INSERT INTO movies (title, type, file_path, subtitles_checked_at, subtitles_check_status) VALUES (?, 'movie', ?, ?, ?)",
      )
      .run(name, filePath, check?.at ?? null, check?.status ?? null).lastInsertRowid as number;
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "filmpick-subsched-"));
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(fetchMovieSubtitles).mockResolvedValue({ status: "not_found" });
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(fetchMovieSubtitles).mockReset();
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("picks never-checked films first, then stale misses and errors; never ones that have subtitles", () => {
    const never = addMovie("never");
    const staleMiss = addMovie("stale-miss", { at: nowS - (NOT_FOUND_RETRY_DAYS + 1) * DAY, status: "not_found" });
    addMovie("fresh-miss", { at: nowS - 2 * DAY, status: "not_found" });
    const staleError = addMovie("stale-error", { at: nowS - (ERROR_RETRY_DAYS + 1) * DAY, status: "error" });
    addMovie("fresh-error", { at: nowS - 3600, status: "error" });
    addMovie("has-subs", { at: nowS - 400 * DAY, status: "exists" });
    addMovie("downloaded", { at: nowS - 400 * DAY, status: "downloaded" });

    expect(dueSubtitleChecks(db, NOW).map((r) => r.id)).toEqual([never, staleMiss, staleError]);
  });

  it("looks up each due film and stops after the per-batch query budget", async () => {
    const ids = [addMovie("a"), addMovie("b"), addMovie("c")];

    const result = await runSubtitleBatch(db, { now: () => NOW, delayMs: 0, maxQueries: 2 });

    expect(result).toMatchObject({ checked: 2, queries: 2, downloaded: 0 });
    expect(vi.mocked(fetchMovieSubtitles).mock.calls.map((c) => c[1])).toEqual(ids.slice(0, 2));
  });

  it("films that already have subtitles cost no lookup budget", async () => {
    addMovie("a");
    addMovie("b");
    addMovie("c");
    vi.mocked(fetchMovieSubtitles)
      .mockResolvedValueOnce({ status: "exists", existing: ["x.srt"] })
      .mockResolvedValueOnce({ status: "exists", existing: ["y.srt"] })
      .mockResolvedValueOnce({ status: "not_found" });

    const result = await runSubtitleBatch(db, { now: () => NOW, delayMs: 0, maxQueries: 1 });

    expect(result).toMatchObject({ checked: 3, queries: 1 });
  });

  it("skips a file that is still being written", async () => {
    addMovie("downloading", null, 60 * 1000);

    expect((await runSubtitleBatch(db, { now: () => NOW, delayMs: 0 })).checked).toBe(0);
    expect(fetchMovieSubtitles).not.toHaveBeenCalled();
  });

  it("does nothing when auto-download is switched off", async () => {
    addMovie("a");
    setSetting(db, "sync_auto_subtitles", "false");

    expect(await runSubtitleBatch(db, { now: () => NOW, delayMs: 0 })).toMatchObject({ skipped: true, checked: 0 });
  });
});
