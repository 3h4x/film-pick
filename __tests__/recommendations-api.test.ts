import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, setCachedEngine, setSetting } from "@/lib/db";
import type { RecommendationGroup } from "@/lib/engines";
import type { TmdbSearchResult } from "@/lib/tmdb";

// Hoist mock functions so they can be referenced inside vi.mock factories.
const { mockGenreEngine, mockCdaEngine } = vi.hoisted(() => ({
  mockGenreEngine: vi.fn<() => Promise<RecommendationGroup[]>>(),
  mockCdaEngine: vi.fn<() => Promise<RecommendationGroup[]>>(),
}));

// Replace the engines module with two engines: one regular (genre) and one
// DB-backed (cda). The buildContext / enrichWithCda helpers pass through so
// the real filtering behaviour still runs.
vi.mock("@/lib/engines", () => ({
  engines: {
    genre: { name: "By Genre", icon: "🎭", engine: mockGenreEngine, dbBacked: false },
    cda: { name: "On CDA", icon: "📺", engine: mockCdaEngine, dbBacked: true },
  },
  buildContext: vi.fn((_library, dismissedIds, config) => ({
    library: [],
    dismissedIds,
    libraryTmdbIds: new Set<number>(),
    libraryTitles: new Set<string>(),
    config,
  })),
  getCdaLookup: vi.fn(() => ({
    byTmdbId: new Map<number, string>(),
    byTitle: new Map<string, string>(),
  })),
  // Return results unchanged so we can assert on raw engine output.
  enrichWithCda: vi.fn((results: TmdbSearchResult[]) => results),
}));

// Patch only getDb; every other DB function runs against the real in-memory DB.
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { GET } from "@/app/api/recommendations/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-recommendations.db");

function makeRec(
  overrides: Partial<TmdbSearchResult> & { tmdb_id: number; title: string },
): TmdbSearchResult {
  return {
    year: 2020,
    genre: "Drama",
    rating: 7.5,
    poster_url: null,
    imdb_id: null,
    ...overrides,
  };
}

function makeGroup(
  overrides: Partial<RecommendationGroup> & { type: string; reason: string },
  recs: TmdbSearchResult[],
): RecommendationGroup {
  return { recommendations: recs, ...overrides };
}

describe("recommendations GET handler", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
    mockGenreEngine.mockResolvedValue([]);
    mockCdaEngine.mockResolvedValue([]);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    vi.clearAllMocks();
  });

  function req(params: Record<string, string> = {}) {
    const url = new URL("http://localhost/api/recommendations");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return new NextRequest(url);
  }

  // ── Single engine: disabled ───────────────────────────────────────────────

  it("returns [] and never calls the engine when engine is disabled", async () => {
    setSetting(db, "disabled_engines", JSON.stringify(["genre"]));

    const res = await GET(req({ engine: "genre" }));
    const data = await res.json();

    expect(data).toEqual([]);
    expect(mockGenreEngine).not.toHaveBeenCalled();
  });

  // ── Single engine: cache miss → run engine ────────────────────────────────

  it("calls the engine on a cache miss and returns its groups", async () => {
    const group = makeGroup(
      { type: "genre", reason: "Because you love Sci-Fi" },
      [makeRec({ tmdb_id: 100, title: "Arrival" })],
    );
    mockGenreEngine.mockResolvedValue([group]);

    const res = await GET(req({ engine: "genre" }));
    const data = await res.json();

    expect(mockGenreEngine).toHaveBeenCalledOnce();
    expect(data).toHaveLength(1);
    expect(data[0].reason).toBe("Because you love Sci-Fi");
    expect(data[0].recommendations[0].title).toBe("Arrival");
  });

  // ── Single engine: cache hit → skip engine ────────────────────────────────

  it("serves cached groups without calling the engine", async () => {
    const group = makeGroup(
      { type: "genre", reason: "Cached Group" },
      [makeRec({ tmdb_id: 200, title: "Cached Film" })],
    );
    // movieCount = 0 because the test library is empty.
    setCachedEngine(db, "genre", [group], 0);

    const res = await GET(req({ engine: "genre" }));
    const data = await res.json();

    expect(mockGenreEngine).not.toHaveBeenCalled();
    expect(data[0].reason).toBe("Cached Group");
  });

  // ── Single engine: refresh=true clears cache ──────────────────────────────

  it("ignores cache and re-runs engine when refresh=true", async () => {
    const stale = makeGroup(
      { type: "genre", reason: "Stale" },
      [makeRec({ tmdb_id: 300, title: "Old Film" })],
    );
    const fresh = makeGroup(
      { type: "genre", reason: "Fresh" },
      [makeRec({ tmdb_id: 301, title: "New Film" })],
    );
    setCachedEngine(db, "genre", [stale], 0);
    mockGenreEngine.mockResolvedValue([fresh]);

    const res = await GET(req({ engine: "genre", refresh: "true" }));
    const data = await res.json();

    expect(mockGenreEngine).toHaveBeenCalledOnce();
    expect(data[0].reason).toBe("Fresh");
    expect(data[0].recommendations[0].title).toBe("New Film");
  });

  // ── max_per_group applied ─────────────────────────────────────────────────

  it("slices recommendations to max_per_group from rec_config", async () => {
    setSetting(
      db,
      "rec_config",
      JSON.stringify({
        max_per_group: 2,
        excluded_genres: [],
        min_year: null,
        min_rating: null,
      }),
    );
    const group = makeGroup(
      { type: "genre", reason: "Big Group" },
      [
        makeRec({ tmdb_id: 10, title: "Film 1" }),
        makeRec({ tmdb_id: 11, title: "Film 2" }),
        makeRec({ tmdb_id: 12, title: "Film 3" }),
      ],
    );
    mockGenreEngine.mockResolvedValue([group]);

    const res = await GET(req({ engine: "genre" }));
    const data = await res.json();

    expect(data[0].recommendations).toHaveLength(2);
  });

  it("defaults max_per_group to 15 when no rec_config is set", async () => {
    const recs = Array.from({ length: 20 }, (_, i) =>
      makeRec({ tmdb_id: 400 + i, title: `Film ${i}` }),
    );
    mockGenreEngine.mockResolvedValue([
      makeGroup({ type: "genre", reason: "Many" }, recs),
    ]);

    const res = await GET(req({ engine: "genre" }));
    const data = await res.json();

    expect(data[0].recommendations).toHaveLength(15);
  });

  // ── DB-backed engine skips cache ──────────────────────────────────────────

  it("always calls a dbBacked engine even when cache exists", async () => {
    const stale = makeGroup(
      { type: "cda", reason: "Stale CDA" },
      [makeRec({ tmdb_id: 500, title: "Old CDA Film" })],
    );
    setCachedEngine(db, "cda", [stale], 0);

    const fresh = makeGroup(
      { type: "cda", reason: "Live CDA" },
      [makeRec({ tmdb_id: 501, title: "Live CDA Film" })],
    );
    mockCdaEngine.mockResolvedValue([fresh]);

    const res = await GET(req({ engine: "cda" }));
    const data = await res.json();

    expect(mockCdaEngine).toHaveBeenCalledOnce();
    expect(data[0].reason).toBe("Live CDA");
  });

  // ── All engines ───────────────────────────────────────────────────────────

  it("runs all engines and aggregates results", async () => {
    mockGenreEngine.mockResolvedValue([
      makeGroup(
        { type: "genre", reason: "Genre picks" },
        [makeRec({ tmdb_id: 600, title: "Genre Film" })],
      ),
    ]);
    mockCdaEngine.mockResolvedValue([
      makeGroup(
        { type: "cda", reason: "On CDA" },
        [makeRec({ tmdb_id: 601, title: "CDA Film" })],
      ),
    ]);

    const res = await GET(req());
    const data = await res.json();

    expect(data).toHaveLength(2);
    const reasons = data.map((g: RecommendationGroup) => g.reason);
    expect(reasons).toContain("Genre picks");
    expect(reasons).toContain("On CDA");
  });

  it("skips disabled engines when running all engines", async () => {
    setSetting(db, "disabled_engines", JSON.stringify(["genre"]));
    mockCdaEngine.mockResolvedValue([
      makeGroup(
        { type: "cda", reason: "CDA only" },
        [makeRec({ tmdb_id: 700, title: "CDA Film" })],
      ),
    ]);

    const res = await GET(req());
    const data = await res.json();

    expect(mockGenreEngine).not.toHaveBeenCalled();
    expect(mockCdaEngine).toHaveBeenCalledOnce();
    expect(data).toHaveLength(1);
    expect(data[0].reason).toBe("CDA only");
  });

  it("returns [] when all engines are disabled", async () => {
    setSetting(db, "disabled_engines", JSON.stringify(["genre", "cda"]));

    const res = await GET(req());
    const data = await res.json();

    expect(data).toEqual([]);
    expect(mockGenreEngine).not.toHaveBeenCalled();
    expect(mockCdaEngine).not.toHaveBeenCalled();
  });

  // ── Unknown engine key ────────────────────────────────────────────────────

  it("falls through to all-engines mode for an unknown engine key", async () => {
    mockGenreEngine.mockResolvedValue([
      makeGroup(
        { type: "genre", reason: "Genre" },
        [makeRec({ tmdb_id: 800, title: "Film" })],
      ),
    ]);

    // "badEngine" is not in the engines map → route skips single-engine branch
    const res = await GET(req({ engine: "badEngine" }));
    const data = await res.json();

    expect(mockGenreEngine).toHaveBeenCalled();
    expect(data.length).toBeGreaterThanOrEqual(1);
  });
});
