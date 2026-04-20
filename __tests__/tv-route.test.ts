import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { initDb, getSetting, setSetting } from "@/lib/db";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

vi.mock("@/lib/epg-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/epg-fetch")>();
  return {
    ...actual,
    getMemCache: vi.fn(),
    fetchAndCacheEpg: vi.fn(),
    invalidateMemCache: vi.fn(),
  };
});

vi.mock("@/lib/epg-scheduler", () => ({
  runEpgRefreshNow: vi.fn(),
  rescheduleEpgJob: vi.fn(),
  initEpgScheduler: vi.fn(),
}));

import { GET } from "@/app/api/tv/route";
import { POST as REFRESH } from "@/app/api/tv/refresh/route";
import { getDb } from "@/lib/db";
import { getMemCache, fetchAndCacheEpg, invalidateMemCache } from "@/lib/epg-fetch";
import { runEpgRefreshNow } from "@/lib/epg-scheduler";

const TEST_DB = path.join(__dirname, "test-tv-route.db");

const MOCK_CACHE = {
  channels: [{ id: "tvn7", name: "TVN 7", icon: null }],
  programs: [],
  cachedAt: "2026-04-20T22:00:00.000Z",
  epgUrl: "https://example.com/epg.xml.gz",
};

describe("GET /api/tv", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    setSetting(db, "epg_enabled", "true");
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
  });

  it("returns 403 when EPG is disabled", async () => {
    setSetting(db, "epg_enabled", "false");
    const req = new Request("http://localhost/api/tv");
    const res = await GET(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("returns cached data with cached:true when mem cache is warm", async () => {
    vi.mocked(getMemCache).mockReturnValue(MOCK_CACHE);
    const req = new Request("http://localhost/api/tv");
    const res = await GET(req);
    const data = await res.json();
    expect(data.cached).toBe(true);
    expect(data.channels).toHaveLength(1);
    expect(fetchAndCacheEpg).not.toHaveBeenCalled();
  });

  it("fetches fresh data when mem cache is cold", async () => {
    vi.mocked(getMemCache).mockReturnValue(null);
    vi.mocked(fetchAndCacheEpg).mockResolvedValue(MOCK_CACHE);
    const req = new Request("http://localhost/api/tv");
    const res = await GET(req);
    const data = await res.json();
    expect(data.cached).toBe(false);
    expect(fetchAndCacheEpg).toHaveBeenCalledOnce();
  });

  it("invalidates mem cache when bust=1 is passed", async () => {
    vi.mocked(getMemCache).mockReturnValue(null);
    vi.mocked(fetchAndCacheEpg).mockResolvedValue(MOCK_CACHE);
    const req = new Request("http://localhost/api/tv?bust=1");
    await GET(req);
    expect(invalidateMemCache).toHaveBeenCalledOnce();
  });

  it("does NOT invalidate mem cache without bust param", async () => {
    vi.mocked(getMemCache).mockReturnValue(MOCK_CACHE);
    const req = new Request("http://localhost/api/tv");
    await GET(req);
    expect(invalidateMemCache).not.toHaveBeenCalled();
  });

  it("returns 502 when fetch fails", async () => {
    vi.mocked(getMemCache).mockReturnValue(null);
    vi.mocked(fetchAndCacheEpg).mockRejectedValue(new Error("timeout"));
    const req = new Request("http://localhost/api/tv");
    const res = await GET(req);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain("timeout");
  });
});

describe("POST /api/tv/refresh", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
  });

  it("returns { status: 'started' } and triggers refresh", async () => {
    const res = await REFRESH();
    const data = await res.json();
    expect(data.status).toBe("started");
    expect(runEpgRefreshNow).toHaveBeenCalledOnce();
    expect(invalidateMemCache).toHaveBeenCalledOnce();
  });

  it("returns 409 when refresh is already running", async () => {
    setSetting(db, "epg_status", "running");
    const res = await REFRESH();
    expect(res.status).toBe(409);
    expect(runEpgRefreshNow).not.toHaveBeenCalled();
  });
});
