import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, dismissRecommendation, getDismissedIds, getDismissedRecommendations } from "@/lib/db";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});
vi.mock("@/lib/tmdb", () => ({ getTmdbMovieSnapshot: vi.fn() }));

import { getDb } from "@/lib/db";
import { getTmdbMovieSnapshot } from "@/lib/tmdb";
import { fillDismissedTitles } from "@/lib/tmdb-refresh";
import { DELETE, GET as GET_ONE, POST } from "@/app/api/recommendations/dismiss/route";
import { GET } from "@/app/api/recommendations/dismissed/route";

const TEST_DB = path.join(__dirname, "test-dismissed.db");

describe("dismissed recommendations keep their titles", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
  });

  afterEach(() => {
    vi.clearAllMocks();
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  const post = (body: unknown) =>
    POST(new NextRequest("http://localhost/api/recommendations/dismiss", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }));

  it("stores the title the client sends and lists it", async () => {
    expect((await post({ tmdb_id: 501, engine: "genre", title: "Sample Movie", year: 1999, pl_title: "Przykładowy Film" })).status).toBe(200);

    const list = await (await GET()).json();
    expect(list).toEqual([
      expect.objectContaining({ tmdb_id: 501, title: "Sample Movie", year: 1999, pl_title: "Przykładowy Film" }),
    ]);
  });

  it("falls back to the recommendation cache when the client sends no title", () => {
    db.prepare(
      "INSERT INTO recommended_movies (tmdb_id, engine, reason, title, year) VALUES (502, 'genre', 'x', 'Another Sample', 2004)",
    ).run();
    dismissRecommendation(db, 502);
    expect(getDismissedRecommendations(db)[0]).toMatchObject({ title: "Another Sample", year: 2004 });
  });

  it("rejects a malformed body", async () => {
    const res = await POST(new NextRequest("http://localhost/api/recommendations/dismiss", { method: "POST", body: "{" }));
    expect(res.status).toBe(400);
  });

  it("the migration backfills old dismissals from the library", () => {
    db.prepare("INSERT INTO movies (title, year, type, tmdb_id) VALUES ('Library Film', 2010, 'movie', 503)").run();
    db.prepare("INSERT INTO dismissed_recommendations (tmdb_id) VALUES (503)").run();
    db.prepare("DELETE FROM _migrations WHERE name = 'add_dismissed_titles'").run();

    initDb(db);

    expect(getDismissedRecommendations(db)[0]).toMatchObject({ tmdb_id: 503, title: "Library Film", year: 2010 });
  });

  it("fills the rest from TMDb; one TMDb no longer knows is not asked again", async () => {
    db.prepare("INSERT INTO dismissed_recommendations (tmdb_id) VALUES (504), (505)").run();
    vi.mocked(getTmdbMovieSnapshot).mockImplementation(async (id: number) =>
      id === 504
        ? ({ title: "Remote Film", year: 2015, pl_title: "Odległy Film" } as Awaited<ReturnType<typeof getTmdbMovieSnapshot>>)
        : null,
    );

    expect(await fillDismissedTitles(db, { limit: 10, delayMs: 0 })).toBe(1);
    const byId = Object.fromEntries(getDismissedRecommendations(db).map((d) => [d.tmdb_id, d]));
    expect(byId[504]).toMatchObject({ title: "Remote Film", year: 2015, pl_title: "Odległy Film" });
    expect(byId[505].title).toBe("");

    vi.mocked(getTmdbMovieSnapshot).mockClear();
    await fillDismissedTitles(db, { limit: 10, delayMs: 0 });
    expect(getTmdbMovieSnapshot).not.toHaveBeenCalled();
  });

  const one = (method: "GET" | "DELETE", query: string) =>
    (method === "GET" ? GET_ONE : DELETE)(
      new NextRequest(`http://localhost/api/recommendations/dismiss${query}`, { method }),
    );

  it("tells the detail whether a film is dismissed, and undoes it", async () => {
    await post({ tmdb_id: 601, title: "Sample Movie", year: 1999 });
    expect(await (await one("GET", "?tmdb_id=601")).json()).toEqual({ dismissed: true });
    expect(await (await one("GET", "?tmdb_id=602")).json()).toEqual({ dismissed: false });

    expect((await one("DELETE", "?tmdb_id=601")).status).toBe(200);
    expect(await (await one("GET", "?tmdb_id=601")).json()).toEqual({ dismissed: false });
    expect(getDismissedRecommendations(db)).toEqual([]);
  });

  it("keeps a dismissed series apart from a film with the same tmdb_id", async () => {
    await post({ tmdb_id: 701, media_type: "tv", title: "Sample Show", year: 2022 });
    expect(await (await one("GET", "?tmdb_id=701&media_type=tv")).json()).toEqual({ dismissed: true });
    expect(await (await one("GET", "?tmdb_id=701")).json()).toEqual({ dismissed: false });
    expect(getDismissedIds(db).has(701)).toBe(false);
    expect(await (await GET()).json()).toEqual([
      expect.objectContaining({ tmdb_id: 701, media_type: "tv", title: "Sample Show", year: 2022 }),
    ]);

    expect((await one("DELETE", "?tmdb_id=701")).status).toBe(200);
    expect(await (await one("GET", "?tmdb_id=701&media_type=tv")).json()).toEqual({ dismissed: true });
    expect((await one("DELETE", "?tmdb_id=701&media_type=tv")).status).toBe(200);
    expect(getDismissedRecommendations(db)).toEqual([]);
  });

  it("requires a numeric tmdb_id for GET and DELETE", async () => {
    for (const q of ["", "?tmdb_id=abc", "?tmdb_id=-1", "?tmdb_id=0"]) {
      expect((await one("GET", q)).status, q).toBe(400);
      expect((await one("DELETE", q)).status, q).toBe(400);
    }
  });
});
