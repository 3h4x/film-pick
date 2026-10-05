import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, setSetting } from "@/lib/db";

vi.mock("@/lib/tmdb-refresh", () => ({ refreshStaleTmdbMetadata: vi.fn() }));
vi.mock("@/lib/tmdb-rematch", () => ({ rematchLocalMovies: vi.fn() }));

import {
  initTmdbRefreshScheduler,
  rescheduleTmdbRefreshJob,
  runTmdbRefreshNow,
} from "@/lib/tmdb-refresh-scheduler";
import { refreshStaleTmdbMetadata } from "@/lib/tmdb-refresh";
import { rematchLocalMovies } from "@/lib/tmdb-rematch";
import { BACKGROUND_ENRICH_OPTIONS, BACKGROUND_REMATCH_OPTIONS } from "@/lib/tmdb-enrich-options";

const TEST_DB = path.join(__dirname, "test-tmdb-refresh-scheduler.db");
const HOUR = 60 * 60 * 1000;

describe("TMDb background refresh scheduler", () => {
  let db: Database.Database;
  const savedKey = process.env.TMDB_API_KEY;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    process.env.TMDB_API_KEY = "test-key";
    vi.mocked(rematchLocalMovies).mockResolvedValue({ matched: 0, unmatched: 0, failed: 0 });
    vi.mocked(refreshStaleTmdbMetadata).mockResolvedValue({ updated: 0, skipped: 0 });
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    setSetting(db, "tmdb_refresh_interval_hours", "0");
    rescheduleTmdbRefreshJob(db); // clear any timer this test armed
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.mocked(rematchLocalMovies).mockReset();
    vi.mocked(refreshStaleTmdbMetadata).mockReset();
    if (savedKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = savedKey;
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("runs one small batch: rematch, then refresh, with the background limits", async () => {
    vi.mocked(rematchLocalMovies).mockResolvedValue({ matched: 2, unmatched: 1, failed: 0 });
    vi.mocked(refreshStaleTmdbMetadata).mockResolvedValue({ updated: 40, skipped: 3 });

    const result = await runTmdbRefreshNow(db);

    expect(result).toEqual({ rematched: 2, refreshed: 40, skipped: false });
    expect(rematchLocalMovies).toHaveBeenCalledWith(db, BACKGROUND_REMATCH_OPTIONS);
    expect(refreshStaleTmdbMetadata).toHaveBeenCalledWith(db, BACKGROUND_ENRICH_OPTIONS);
    expect(BACKGROUND_ENRICH_OPTIONS.limit).toBeLessThanOrEqual(100);
  });

  it("does nothing without a TMDb key", async () => {
    delete process.env.TMDB_API_KEY;

    expect(await runTmdbRefreshNow(db)).toEqual({ rematched: 0, refreshed: 0, skipped: true });
    expect(refreshStaleTmdbMetadata).not.toHaveBeenCalled();
  });

  it("joins a batch already in progress instead of starting a second one", async () => {
    let release: () => void = () => {};
    vi.mocked(refreshStaleTmdbMetadata).mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ updated: 1, skipped: 0 });
      }),
    );

    const first = runTmdbRefreshNow(db);
    const second = runTmdbRefreshNow(db);
    await vi.waitFor(() => expect(refreshStaleTmdbMetadata).toHaveBeenCalled());
    release();

    expect(await second).toEqual(await first);
    expect(refreshStaleTmdbMetadata).toHaveBeenCalledTimes(1);
  });

  it("survives a failing batch", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(refreshStaleTmdbMetadata).mockRejectedValue(new Error("tmdb_api_error:500"));

    expect(await runTmdbRefreshNow(db)).toEqual({ rematched: 0, refreshed: 0, skipped: false });
    // The next batch runs normally.
    vi.mocked(refreshStaleTmdbMetadata).mockResolvedValue({ updated: 5, skipped: 0 });
    expect((await runTmdbRefreshNow(db)).refreshed).toBe(5);
  });

  it("runs a first batch shortly after startup, then hourly", async () => {
    vi.useFakeTimers();
    initTmdbRefreshScheduler(db);

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    expect(refreshStaleTmdbMetadata).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(HOUR);
    expect(refreshStaleTmdbMetadata).toHaveBeenCalledTimes(2);
  });

  it("honors tmdb_refresh_interval_hours, and 0 turns the job off", async () => {
    vi.useFakeTimers();
    setSetting(db, "tmdb_refresh_interval_hours", "6");
    rescheduleTmdbRefreshJob(db);
    await vi.advanceTimersByTimeAsync(5 * HOUR);
    expect(refreshStaleTmdbMetadata).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(refreshStaleTmdbMetadata).toHaveBeenCalledTimes(1);

    setSetting(db, "tmdb_refresh_interval_hours", "0");
    rescheduleTmdbRefreshJob(db);
    await vi.advanceTimersByTimeAsync(24 * HOUR);
    expect(refreshStaleTmdbMetadata).toHaveBeenCalledTimes(1);
  });
});
