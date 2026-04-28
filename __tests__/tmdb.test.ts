import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Prevent tmdb.ts from opening the real production DB when resolving the API key
// via getDbApiKey(). All tests in this file set process.env.TMDB_API_KEY so the
// env-var path is always taken; the DB path is never needed.
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => { throw new Error("no db in tmdb tests"); }),
  getSetting: vi.fn(() => null),
}));

import {
  searchTmdb,
  getTmdbRecommendations,
  getTmdbSimilar,
  genreNameToId,
  getMovieLocalized,
  getPolishTitle,
  getTmdbMovieDetails,
  getMovieCredits,
  searchTmdbPl,
} from "@/lib/tmdb";

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

describe("searchTmdb year fallback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-key";
  });

  function okPage(id: number, year: number) {
    return {
      ok: true,
      json: async () => ({
        results: [
          {
            id,
            title: `Film ${year}`,
            release_date: `${year}-06-01`,
            genre_ids: [18],
            vote_average: 7.0,
            poster_path: null,
          },
        ],
      }),
    };
  }

  const emptyPage = { ok: true, json: async () => ({ results: [] }) };

  it("returns first-call results when year provided and results found", async () => {
    mockFetch.mockResolvedValueOnce(okPage(1, 2020));

    const results = await searchTmdb("Film", 2020);
    expect(results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("year=2020"),
      expect.any(Object),
    );
  });

  it("tries year+1 when exact year returns no results", async () => {
    mockFetch.mockResolvedValueOnce(emptyPage).mockResolvedValueOnce(okPage(2, 2021));

    const results = await searchTmdb("Film", 2020);
    expect(results).toHaveLength(1);
    expect(results[0].year).toBe(2021);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain("year=2020");
    expect(mockFetch.mock.calls[1][0]).toContain("year=2021");
  });

  it("tries year-1 when year and year+1 both return no results", async () => {
    mockFetch
      .mockResolvedValueOnce(emptyPage)
      .mockResolvedValueOnce(emptyPage)
      .mockResolvedValueOnce(okPage(3, 2019));

    const results = await searchTmdb("Film", 2020);
    expect(results).toHaveLength(1);
    expect(results[0].year).toBe(2019);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[2][0]).toContain("year=2019");
  });

  it("falls back to no-year query when year, year+1, and year-1 all return no results", async () => {
    mockFetch
      .mockResolvedValueOnce(emptyPage)
      .mockResolvedValueOnce(emptyPage)
      .mockResolvedValueOnce(emptyPage)
      .mockResolvedValueOnce(okPage(4, 2018));

    const results = await searchTmdb("Film", 2020);
    expect(results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(4);
    // Final call must not include a year filter
    expect(mockFetch.mock.calls[3][0]).not.toContain("year=");
  });

  it("returns empty array when all four fallbacks return no results", async () => {
    mockFetch.mockResolvedValue(emptyPage);

    const results = await searchTmdb("Film", 2020);
    expect(results).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("makes only one fetch call when no year is provided", async () => {
    mockFetch.mockResolvedValueOnce(emptyPage);

    const results = await searchTmdb("Film");
    expect(results).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("makes only one fetch call when year is null", async () => {
    mockFetch.mockResolvedValueOnce(emptyPage);

    const results = await searchTmdb("Film", null);
    expect(results).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not start year fallback when year is provided and first call succeeds", async () => {
    mockFetch.mockResolvedValueOnce(okPage(5, 2020));

    await searchTmdb("Film", 2020);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("genreNameToId", () => {
  it("returns the TMDb genre ID for a known genre", () => {
    expect(genreNameToId("Action")).toBe(28);
    expect(genreNameToId("Drama")).toBe(18);
    expect(genreNameToId("Sci-Fi")).toBe(878);
    expect(genreNameToId("Horror")).toBe(27);
  });

  it("returns null for an unknown genre", () => {
    expect(genreNameToId("Telenovela")).toBeNull();
    expect(genreNameToId("")).toBeNull();
  });
});

describe("getMovieLocalized", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("returns pl_title and description from the API response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: "Incepcja", overview: "Film o snach." }),
    });

    const result = await getMovieLocalized(27205);
    expect(result.pl_title).toBe("Incepcja");
    expect(result.description).toBe("Film o snach.");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("language=pl-PL"),
      expect.any(Object),
    );
  });

  it("returns nulls on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const result = await getMovieLocalized(99999);
    expect(result).toEqual({ pl_title: null, description: null });
  });

  it("returns nulls when title and overview are missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    const result = await getMovieLocalized(1);
    expect(result).toEqual({ pl_title: null, description: null });
  });

  it("falls back to English description when Polish overview is missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: "Incepcja" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ overview: "A thief who steals corporate secrets." }),
    });
    const result = await getMovieLocalized(27205);
    expect(result.pl_title).toBe("Incepcja");
    expect(result.description).toBe("A thief who steals corporate secrets.");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("language=pl-PL"),
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("language=en-US"),
      expect.any(Object),
    );
  });
});

describe("getPolishTitle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("returns the Polish title when available", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: "Labirynt Fauna", overview: "..." }),
    });
    expect(await getPolishTitle(268)).toBe("Labirynt Fauna");
  });

  it("returns null when the API errors", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(await getPolishTitle(1)).toBeNull();
  });
});

describe("getTmdbMovieDetails", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("parses director, writer and top actors from credits", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        credits: {
          crew: [
            { job: "Director", name: "Christopher Nolan" },
            { job: "Screenplay", name: "Christopher Nolan" },
          ],
          cast: [
            { name: "Leonardo DiCaprio", character: "Cobb" },
            { name: "Joseph Gordon-Levitt", character: "Arthur" },
          ],
        },
      }),
    });

    const details = await getTmdbMovieDetails(27205);
    expect(details.director).toBe("Christopher Nolan");
    expect(details.writer).toBe("Christopher Nolan");
    expect(details.actors).toBe("Leonardo DiCaprio, Joseph Gordon-Levitt");
  });

  it("returns nulls when credits are missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    const details = await getTmdbMovieDetails(1);
    expect(details).toEqual({ director: null, writer: null, actors: null });
  });

  it("returns nulls on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const details = await getTmdbMovieDetails(99999);
    expect(details).toEqual({ director: null, writer: null, actors: null });
  });

  it("limits actors to 5 names", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        credits: {
          crew: [],
          cast: Array.from({ length: 10 }, (_, i) => ({
            name: `Actor ${i + 1}`,
            character: "Someone",
          })),
        },
      }),
    });
    const details = await getTmdbMovieDetails(1);
    expect(details.actors?.split(", ")).toHaveLength(5);
  });
});

describe("getMovieCredits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-key";
  });

  it("returns directors and top cast from the credits endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        crew: [
          { id: 525, name: "Christopher Nolan", job: "Director" },
          { id: 526, name: "Emma Thomas", job: "Producer" },
        ],
        cast: [
          { id: 6193, name: "Leonardo DiCaprio", character: "Cobb" },
          { id: 24045, name: "Joseph Gordon-Levitt", character: "Arthur" },
        ],
      }),
    });

    const credits = await getMovieCredits(27205);
    expect(credits.directors).toHaveLength(1);
    expect(credits.directors[0].name).toBe("Christopher Nolan");
    expect(credits.cast).toHaveLength(2);
    expect(credits.cast[0].character).toBe("Cobb");
  });

  it("returns empty arrays on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const credits = await getMovieCredits(99999);
    expect(credits).toEqual({ directors: [], cast: [] });
  });

  it("limits cast to 5 members", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        crew: [],
        cast: Array.from({ length: 10 }, (_, i) => ({
          id: i,
          name: `Actor ${i}`,
          character: "Someone",
        })),
      }),
    });
    const credits = await getMovieCredits(1);
    expect(credits.cast).toHaveLength(5);
  });
});

// ── fetchWithRetry behaviour (429 rate-limit handling) ───────────────────────
// These tests use fake timers to skip the exponential-backoff sleep without
// waiting real time, so they run instantly.

const rawFilm = {
  id: 999,
  title: "Retry Film",
  release_date: "2020-01-01",
  genre_ids: [18],
  vote_average: 7.5,
  poster_path: null,
};

describe("fetchWithRetry — 429 rate-limit handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    process.env.TMDB_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("getTmdbRecommendations retries once on 429 and returns results on the next attempt", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [rawFilm] }),
      });

    const promise = getTmdbRecommendations(12345);
    await vi.advanceTimersByTimeAsync(1001); // past the 1 s first-retry delay
    const results = await promise;

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Retry Film");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("getTmdbRecommendations returns [] after exhausting all 3 retries", async () => {
    // All 4 attempts (attempt 0 + 3 retries) get 429.
    mockFetch.mockResolvedValue({ ok: false, status: 429 });

    const promise = getTmdbRecommendations(12345);
    // Total sleep: 1 s + 2 s + 4 s = 7 s
    await vi.advanceTimersByTimeAsync(7001);
    const results = await promise;

    expect(results).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("getTmdbSimilar retries on 429 and returns results on success", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [rawFilm] }),
      });

    const promise = getTmdbSimilar(12345);
    await vi.advanceTimersByTimeAsync(1001);
    const results = await promise;

    expect(results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("getMovieLocalized retries on 429 and returns data on success", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ title: "Retrybowiec", overview: "Opis." }),
      });

    const promise = getMovieLocalized(12345);
    await vi.advanceTimersByTimeAsync(1001);
    const result = await promise;

    expect(result.pl_title).toBe("Retrybowiec");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("getTmdbMovieDetails retries on 429 and returns credits on success", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          credits: {
            crew: [{ job: "Director", name: "A. Director" }],
            cast: [],
          },
        }),
      });

    const promise = getTmdbMovieDetails(12345);
    await vi.advanceTimersByTimeAsync(1001);
    const details = await promise;

    expect(details.director).toBe("A. Director");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("getMovieCredits retries on 429 and returns credits on success", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          crew: [{ id: 1, name: "A. Director", job: "Director" }],
          cast: [],
        }),
      });

    const promise = getMovieCredits(12345);
    await vi.advanceTimersByTimeAsync(1001);
    const credits = await promise;

    expect(credits.directors).toHaveLength(1);
    expect(credits.directors[0].name).toBe("A. Director");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("searchTmdb retries on 429 and returns results on success", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [rawFilm] }),
      });

    const promise = searchTmdb("Retry Film");
    await vi.advanceTimersByTimeAsync(1001);
    const results = await promise;

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Retry Film");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("searchTmdb throws tmdb_api_error after exhausting all retries", async () => {
    // All 4 attempts return 429; fetchWithRetry returns the final 429 response,
    // then searchTmdb sees !res.ok and throws.
    mockFetch.mockResolvedValue({ ok: false, status: 429, statusText: "Too Many Requests", text: async () => "" });

    const promise = searchTmdb("Retry Film");
    // Attach rejection handler BEFORE advancing timers so the rejection is not unhandled.
    const assertion = expect(promise).rejects.toThrow("tmdb_api_error:429");
    await vi.advanceTimersByTimeAsync(7001); // 1s + 2s + 4s
    await assertion;
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});

// ── searchTmdbPl ─────────────────────────────────────────────────────────────

describe("searchTmdbPl", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TMDB_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.TMDB_API_KEY;
  });

  function plResult(overrides: { id?: number; genre_ids?: number[]; vote_average?: number; overview?: string | null } = {}) {
    return {
      results: [
        {
          id: overrides.id ?? 42,
          genre_ids: overrides.genre_ids ?? [18, 53],
          vote_average: overrides.vote_average ?? 7.8,
          overview: overrides.overview ?? "Opis po polsku.",
        },
      ],
    };
  }

  it("returns tmdb_id, genre, rating, description on a successful match", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => plResult() });

    const result = await searchTmdbPl("Incepcja", 2010);

    expect(result).not.toBeNull();
    expect(result!.tmdb_id).toBe(42);
    expect(result!.genre).toContain("Drama");
    expect(result!.genre).toContain("Thriller");
    expect(result!.rating).toBe(7.8);
    expect(result!.description).toBe("Opis po polsku.");
  });

  it("searches with language=pl-PL", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => plResult() });
    await searchTmdbPl("Film", null);
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("language=pl-PL");
  });

  it("appends year to the query when provided", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => plResult() });
    await searchTmdbPl("Film", 2015);
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("year=2015");
  });

  it("returns null when no results are found", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    const result = await searchTmdbPl("Unknown Film", null);
    expect(result).toBeNull();
  });

  it("returns null when TMDB_API_KEY is not set", async () => {
    delete process.env.TMDB_API_KEY;
    const result = await searchTmdbPl("Film", null);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null on non-ok response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const result = await searchTmdbPl("Film", null);
    expect(result).toBeNull();
  });

  it("falls back to year+1 when exact year returns no results", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
      .mockResolvedValue({ ok: true, json: async () => plResult({ id: 99 }) });
    const result = await searchTmdbPl("Film", 2010);
    expect(result!.tmdb_id).toBe(99);
    const secondUrl = String(mockFetch.mock.calls[1][0]);
    expect(secondUrl).toContain("year=2011");
  });

  it("falls back to no-year query when year, year+1, and year-1 all miss", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
      .mockResolvedValue({ ok: true, json: async () => plResult({ id: 77 }) });
    const result = await searchTmdbPl("Film", 2010);
    expect(result!.tmdb_id).toBe(77);
    const fourthUrl = String(mockFetch.mock.calls[3][0]);
    expect(fourthUrl).not.toContain("year=");
  });

  it("maps description to null when overview is empty string", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => plResult({ overview: "" }) });
    const result = await searchTmdbPl("Film", null);
    expect(result!.description).toBeNull();
  });
});
