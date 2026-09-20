import { describe, it, expect, vi, afterEach } from "vitest";
import {
  DEFAULT_LIBRARY_VIEW,
  parseLibraryViewPrefs,
  readLibraryViewPrefs,
  writeLibraryViewPrefs,
} from "@/lib/library-view-prefs";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void data.set(k, v)),
    data,
  };
}

describe("library view prefs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const full = {
    sort: "rating",
    sortDir: "asc",
    genreFilter: "Drama",
    sourceFilter: "tmdb",
    yearFilter: "2026",
    unratedOnly: true,
    hasFileOnly: true,
  };

  it("parses a complete valid value", () => {
    expect(parseLibraryViewPrefs(JSON.stringify(full))).toEqual(full);
  });

  it("returns nothing for missing, corrupt or non-object input", () => {
    expect(parseLibraryViewPrefs(null)).toEqual({});
    expect(parseLibraryViewPrefs("not json")).toEqual({});
    expect(parseLibraryViewPrefs("42")).toEqual({});
    expect(parseLibraryViewPrefs("null")).toEqual({});
  });

  it("drops fields with an invalid value and keeps the valid ones", () => {
    const parsed = parseLibraryViewPrefs(
      JSON.stringify({ ...full, sort: "popularity", sortDir: "up", genreFilter: 5, hasFileOnly: "yes" }),
    );
    expect(parsed).toEqual({
      sourceFilter: "tmdb",
      yearFilter: "2026",
      unratedOnly: true,
    });
  });

  it("accepts every sort option the sort bar offers", () => {
    for (const sort of ["user_rating", "rating", "year", "title", "created_at", "rated_at"]) {
      expect(parseLibraryViewPrefs(JSON.stringify({ sort }))).toEqual({ sort });
    }
  });

  it("round-trips through storage", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    writeLibraryViewPrefs({ ...DEFAULT_LIBRARY_VIEW, hasFileOnly: true, sort: "year" });
    expect(readLibraryViewPrefs()).toEqual({ ...DEFAULT_LIBRARY_VIEW, hasFileOnly: true, sort: "year" });
  });

  it("works without storage: reads nothing, writes silently", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readLibraryViewPrefs()).toEqual({});
    expect(() => writeLibraryViewPrefs(DEFAULT_LIBRARY_VIEW)).not.toThrow();
  });

  it("defaults match the app's initial view", () => {
    expect(DEFAULT_LIBRARY_VIEW).toEqual({
      sort: "created_at",
      sortDir: "desc",
      genreFilter: "",
      sourceFilter: "",
      yearFilter: "",
      unratedOnly: false,
      hasFileOnly: false,
    });
  });
});
