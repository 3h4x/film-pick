import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TmdbSearchResult } from "@/lib/tmdb";

vi.mock("@/lib/tmdb", () => ({
  searchTmdb: vi.fn(),
}));

import { POST } from "@/app/api/tv/enrich/route";
import { searchTmdb } from "@/lib/tmdb";

function makeResult(overrides: Partial<TmdbSearchResult> = {}): TmdbSearchResult {
  return {
    title: "Interstellar",
    year: 2014,
    genre: "Science Fiction",
    rating: 8.4,
    poster_url: null,
    tmdb_id: 157336,
    imdb_id: "tt0816692",
    ...overrides,
  };
}

function makeRequest(titles: string[]) {
  return new Request("http://localhost/api/tv/enrich", {
    method: "POST",
    body: JSON.stringify({ titles }),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/tv/enrich", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns rating and year for a matched title", async () => {
    vi.mocked(searchTmdb).mockResolvedValue([makeResult({ rating: 8.4, year: 2014 })]);
    const res = await POST(makeRequest(["Interstellar 2014"]));
    const data = await res.json();
    expect(data["Interstellar 2014"]).toEqual({ rating: 8.4, year: 2014 });
  });

  it("returns null rating and year when TMDb returns no results", async () => {
    vi.mocked(searchTmdb).mockResolvedValue([]);
    const res = await POST(makeRequest(["Unknown Film XYZ123"]));
    const data = await res.json();
    expect(data["Unknown Film XYZ123"]).toEqual({ rating: null, year: null });
  });

  it("returns null rating and year on TMDb error", async () => {
    vi.mocked(searchTmdb).mockRejectedValue(new Error("network error"));
    const res = await POST(makeRequest(["Error Film ABC"]));
    const data = await res.json();
    expect(data["Error Film ABC"]).toEqual({ rating: null, year: null });
  });

  it("handles multiple titles in one request", async () => {
    vi.mocked(searchTmdb)
      .mockResolvedValueOnce([makeResult({ title: "The Matrix", rating: 8.7, year: 1999 })])
      .mockResolvedValueOnce([makeResult({ title: "Blade Runner", rating: 8.1, year: 1982 })]);
    const res = await POST(makeRequest(["The Matrix multi", "Blade Runner multi"]));
    const data = await res.json();
    expect(data["The Matrix multi"]).toEqual({ rating: 8.7, year: 1999 });
    expect(data["Blade Runner multi"]).toEqual({ rating: 8.1, year: 1982 });
    expect(searchTmdb).toHaveBeenCalledTimes(2);
  });

  it("returns empty object for empty titles array", async () => {
    const res = await POST(makeRequest([]));
    const data = await res.json();
    expect(data).toEqual({});
    expect(searchTmdb).not.toHaveBeenCalled();
  });

  it("uses cached result for repeated title (no second TMDb call)", async () => {
    vi.mocked(searchTmdb).mockResolvedValue([makeResult({ rating: 7.5, year: 2010 })]);
    await POST(makeRequest(["Inception cached"]));
    vi.clearAllMocks();
    vi.mocked(searchTmdb).mockResolvedValue([makeResult({ rating: 9.9, year: 2099 })]);
    const res = await POST(makeRequest(["Inception cached"]));
    const data = await res.json();
    expect(searchTmdb).not.toHaveBeenCalled();
    expect(data["Inception cached"]).toEqual({ rating: 7.5, year: 2010 });
  });

  it("uses only the top TMDb result when multiple hits are returned", async () => {
    vi.mocked(searchTmdb).mockResolvedValue([
      makeResult({ rating: 9.0, year: 2020 }),
      makeResult({ rating: 5.0, year: 2005 }),
    ]);
    const res = await POST(makeRequest(["Top Result Only"]));
    const data = await res.json();
    expect(data["Top Result Only"]).toEqual({ rating: 9.0, year: 2020 });
  });

  it("handles mixed success and error titles", async () => {
    vi.mocked(searchTmdb)
      .mockResolvedValueOnce([makeResult({ rating: 7.8, year: 2015 })])
      .mockRejectedValueOnce(new Error("API error"));
    const res = await POST(makeRequest(["Good Film mixed", "Bad Film mixed"]));
    const data = await res.json();
    expect(data["Good Film mixed"]).toEqual({ rating: 7.8, year: 2015 });
    expect(data["Bad Film mixed"]).toEqual({ rating: null, year: null });
  });

  it("returns 200 status on success", async () => {
    vi.mocked(searchTmdb).mockResolvedValue([]);
    const res = await POST(makeRequest(["Status Check"]));
    expect(res.status).toBe(200);
  });
});
