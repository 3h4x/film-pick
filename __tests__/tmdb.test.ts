import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchTmdb, getTmdbRecommendations, getTmdbSimilar } from "@/lib/tmdb";

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

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized", text: async () => "" });

    await expect(searchTmdb("inception")).rejects.toThrow("tmdb_api_error:401");
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

  it("fetches similar movies for a tmdb id", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 157336,
            title: "Interstellar",
            release_date: "2014-11-05",
            genre_ids: [18, 878],
            vote_average: 8.4,
            poster_path: "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
          },
          {
            id: 329865,
            title: "Arrival",
            release_date: "2016-11-11",
            genre_ids: [18, 878],
            vote_average: 7.9,
            poster_path: "/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg",
          },
        ],
      }),
    });

    const similar = await getTmdbSimilar(27205);
    expect(similar).toHaveLength(2);
    expect(similar[0].title).toBe("Interstellar");
    expect(similar[0].tmdb_id).toBe(157336);
    expect(similar[1].title).toBe("Arrival");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/movie/27205/similar"),
      expect.any(Object),
    );
  });

  it("returns empty array when similar endpoint returns error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const similar = await getTmdbSimilar(99999);
    expect(similar).toEqual([]);
  });

  it("limits similar results to 5", async () => {
    const manyResults = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      title: `Film ${i}`,
      release_date: "2020-01-01",
      genre_ids: [18],
      vote_average: 7.0,
      poster_path: null,
    }));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: manyResults }),
    });

    const similar = await getTmdbSimilar(100);
    expect(similar).toHaveLength(5);
  });
});
