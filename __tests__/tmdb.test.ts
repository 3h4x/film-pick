import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchTmdb, getTmdbRecommendations } from "@/lib/tmdb";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("tmdb client", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("searches movies by query", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 27205,
            title: "Inception",
            release_date: "2010-07-16",
            genre_ids: [28, 878],
            vote_average: 8.365,
            poster_path: "/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg",
          },
        ],
      }),
    });

    const results = await searchTmdb("inception");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Inception");
    expect(results[0].year).toBe(2010);
    expect(results[0].tmdb_id).toBe(27205);
    expect(results[0].rating).toBeCloseTo(8.4, 0);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("query=inception"),
      expect.any(Object),
    );
  });

  it("returns empty array on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    const results = await searchTmdb("inception");
    expect(results).toEqual([]);
  });

  it("fetches recommendations for a tmdb id", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 155,
            title: "The Dark Knight",
            release_date: "2008-07-18",
            genre_ids: [18, 28, 80],
            vote_average: 8.516,
            poster_path: "/qJ2tW6WMUDux911BTUgMe1nNaD.jpg",
          },
        ],
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        credits: {
          crew: [{ job: "Director", name: "Christopher Nolan" }],
        },
      }),
    });

    const recs = await getTmdbRecommendations(27205);
    expect(recs).toHaveLength(1);
    expect(recs[0].title).toBe("The Dark Knight");
    expect(recs[0].year).toBe(2008);
  });
});
