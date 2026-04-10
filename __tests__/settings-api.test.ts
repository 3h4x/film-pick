import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, getSetting, setSetting } from "@/lib/db";

// Patch only getDb so the route uses our in-memory DB; keep all other db functions real.
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: vi.fn() };
});

import { GET, PATCH } from "@/app/api/settings/route";
import { getDb } from "@/lib/db";

const TEST_DB = path.join(__dirname, "test-settings.db");

describe("settings API", () => {
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

  // ── DB layer ───────────────────────────────────────────────────────────────

  describe("getSetting / setSetting (DB layer)", () => {
    it("returns null for a missing key", () => {
      expect(getSetting(db, "nonexistent")).toBeNull();
    });

    it("stores and retrieves a setting", () => {
      setSetting(db, "library_path", "/movies");
      expect(getSetting(db, "library_path")).toBe("/movies");
    });

    it("overwrites an existing setting (INSERT OR REPLACE)", () => {
      setSetting(db, "library_path", "/old");
      setSetting(db, "library_path", "/new");
      expect(getSetting(db, "library_path")).toBe("/new");
    });

    it("stores multiple settings independently", () => {
      setSetting(db, "library_path", "/movies");
      setSetting(db, "rec_config", '{"max_per_group":10}');
      expect(getSetting(db, "library_path")).toBe("/movies");
      expect(getSetting(db, "rec_config")).toBe('{"max_per_group":10}');
    });
  });

  // ── GET /api/settings ──────────────────────────────────────────────────────

  describe("GET /api/settings", () => {
    it("returns null defaults when no settings are stored", async () => {
      const res = await GET();
      const data = await res.json();
      expect(data.library_path).toBeNull();
      expect(data.rec_group_order).toEqual([]);
      expect(data.rec_config).toBeNull();
      expect(data.tmdb_api_key_set).toBe(false);
      expect(data.tmdb_api_key_source).toBeNull();
      expect(data.disabled_engines).toEqual([]);
    });

    it("returns stored library_path and disabled_engines", async () => {
      setSetting(db, "library_path", "/movies");
      setSetting(db, "disabled_engines", JSON.stringify(["genre", "actor"]));

      const res = await GET();
      const data = await res.json();
      expect(data.library_path).toBe("/movies");
      expect(data.disabled_engines).toEqual(["genre", "actor"]);
    });

    it("parses rec_config JSON and returns it as an object", async () => {
      const cfg = {
        max_per_group: 5,
        excluded_genres: ["Horror"],
        min_year: 2000,
        min_rating: null,
      };
      setSetting(db, "rec_config", JSON.stringify(cfg));

      const res = await GET();
      const data = await res.json();
      expect(data.rec_config.max_per_group).toBe(5);
      expect(data.rec_config.excluded_genres).toEqual(["Horror"]);
      expect(data.rec_config.min_year).toBe(2000);
    });

    it("parses rec_group_order JSON and returns it as an array", async () => {
      setSetting(db, "rec_group_order", JSON.stringify(["genre", "director"]));

      const res = await GET();
      const data = await res.json();
      expect(data.rec_group_order).toEqual(["genre", "director"]);
    });

    it("reports tmdb_api_key_set=true and source=db when key is stored in DB", async () => {
      setSetting(db, "tmdb_api_key", "secret-token");

      const res = await GET();
      const data = await res.json();
      expect(data.tmdb_api_key_set).toBe(true);
      expect(data.tmdb_api_key_source).toBe("db");
    });
  });

  // ── PATCH /api/settings ────────────────────────────────────────────────────

  describe("PATCH /api/settings", () => {
    function makeRequest(body: object) {
      return new NextRequest("http://localhost/api/settings", {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      });
    }

    it("returns ok:true on success", async () => {
      const res = await PATCH(makeRequest({ rec_group_order: [] }));
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it("persists rec_group_order", async () => {
      await PATCH(makeRequest({ rec_group_order: ["genre", "director"] }));
      expect(getSetting(db, "rec_group_order")).toBe(
        JSON.stringify(["genre", "director"]),
      );
    });

    it("persists disabled_engines", async () => {
      await PATCH(makeRequest({ disabled_engines: ["actor", "random"] }));
      expect(getSetting(db, "disabled_engines")).toBe(
        JSON.stringify(["actor", "random"]),
      );
    });

    it("persists rec_config", async () => {
      const cfg = {
        max_per_group: 8,
        excluded_genres: ["Comedy"],
        min_year: 1990,
        min_rating: 6.0,
      };
      await PATCH(makeRequest({ rec_config: cfg }));
      const stored = getSetting(db, "rec_config");
      expect(JSON.parse(stored!)).toEqual(cfg);
    });

    it("stores tmdb_api_key with leading/trailing whitespace trimmed", async () => {
      await PATCH(makeRequest({ tmdb_api_key: "  my-api-key  " }));
      expect(getSetting(db, "tmdb_api_key")).toBe("my-api-key");
    });

    it("deletes tmdb_api_key when an empty string is provided", async () => {
      setSetting(db, "tmdb_api_key", "existing-key");
      await PATCH(makeRequest({ tmdb_api_key: "" }));
      expect(getSetting(db, "tmdb_api_key")).toBeNull();
    });

    it("deletes tmdb_api_key when a whitespace-only string is provided", async () => {
      setSetting(db, "tmdb_api_key", "existing-key");
      await PATCH(makeRequest({ tmdb_api_key: "   " }));
      expect(getSetting(db, "tmdb_api_key")).toBeNull();
    });

    it("ignores unknown body fields without error", async () => {
      const res = await PATCH(makeRequest({ unknown_field: "value" }));
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it("only updates fields that are present in the body", async () => {
      setSetting(db, "library_path", "/movies");
      await PATCH(makeRequest({ disabled_engines: ["genre"] }));
      // library_path is managed by the sync/import routes, not settings PATCH
      // but it should remain unchanged if we only send disabled_engines
      expect(getSetting(db, "library_path")).toBe("/movies");
    });
  });
});
