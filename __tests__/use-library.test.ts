// tamtam inspected 2026-05-21
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildWishlistActionRequest,
  fetchLibrarySearchMovies,
  requestMovieDelete,
  restoreMovieAt,
} from "@/lib/hooks/useLibrary";
import { createLatestOnlyRunner } from "@/lib/latest-only-runner";
import type { Movie } from "@/lib/types";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function makeMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 42,
    title: "Priscilla",
    year: 2023,
    genre: "Drama, Romance",
    director: null,
    writer: null,
    actors: null,
    rating: 6.7,
    user_rating: null,
    poster_url: null,
    source: "tmdb",
    tmdb_id: 1022796,
    type: "movie",
    file_path: null,
    filmweb_url: null,
    cda_url: null,
    pl_title: null,
    rated_at: null,
    created_at: "2026-05-12T00:00:00.000Z",
    wishlist: 1,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildWishlistActionRequest", () => {
  it("clears wishlist without setting a rating when removing from watchlist", () => {
    const movie = makeMovie();

    const result = buildWishlistActionRequest(movie, "remove");

    expect(result.nextMovie.wishlist).toBe(0);
    expect(result.nextMovie.user_rating).toBeNull();
    expect(result.requestBody).toEqual({ wishlist: 0 });
    expect(result.toast).toBe('Removed "Priscilla" from watchlist');
  });

  it("moves a liked watchlist movie into the library with a rating", () => {
    const movie = makeMovie();

    const result = buildWishlistActionRequest(movie, "liked");

    expect(result.nextMovie.wishlist).toBe(0);
    expect(result.nextMovie.user_rating).toBe(8);
    expect(result.requestBody).toEqual({ user_rating: 8, wishlist: 0 });
  });
});

describe("library search requests", () => {
  it("does not apply a slower stale search response after a newer query starts", async () => {
    const first = createDeferred<Response>();
    const second = createDeferred<Response>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetchMock);

    const runner = createLatestOnlyRunner<Movie[]>();
    let appliedMovies: Movie[] = [];

    const firstRun = runner.run(
      () => fetchLibrarySearchMovies("twin"),
      {
        onSuccess: (movies) => {
          appliedMovies = movies;
        },
      },
    );
    const secondRun = runner.run(
      () => fetchLibrarySearchMovies("arrival"),
      {
        onSuccess: (movies) => {
          appliedMovies = movies;
        },
      },
    );

    first.resolve(Response.json([makeMovie({ id: 1, title: "Twin Peaks" })]));
    await firstRun;

    expect(appliedMovies).toEqual([]);

    second.resolve(Response.json([makeMovie({ id: 2, title: "Arrival" })]));
    await secondRun;

    expect(appliedMovies.map((movie) => movie.title)).toEqual(["Arrival"]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/movies?q=twin", {
      signal: undefined,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/movies?q=arrival", {
      signal: undefined,
    });
  });

  it("clears results when the latest search request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("Search unavailable", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const runner = createLatestOnlyRunner<Movie[]>();
    let appliedMovies = [makeMovie({ title: "Previous result" })];

    await runner.run(
      () => fetchLibrarySearchMovies("arrival"),
      {
        onSuccess: (movies) => {
          appliedMovies = movies;
        },
        onError: () => {
          appliedMovies = [];
        },
      },
    );

    expect(appliedMovies).toEqual([]);
  });
});

describe("requestMovieDelete", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports success when the server deletes the movie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestMovieDelete(7, "Twin")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/movies/7", { method: "DELETE" });
  });

  it("tells the user when the rate limit rejected the delete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "rate_limited", retry_after: 5 }), {
          status: 429,
        }),
      ),
    );

    const result = await requestMovieDelete(7, "Twin");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("was not removed");
    expect(result.ok === false && result.message).toContain("5s");
  });

  it("prefers the Retry-After header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{}", { status: 429, headers: { "Retry-After": "12" } }),
      ),
    );

    const result = await requestMovieDelete(7, "Twin");
    expect(result.ok === false && result.message).toContain("12s");
  });

  it("reports a server error with its status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));

    const result = await requestMovieDelete(7, "Twin");
    expect(result.ok === false && result.message).toContain("500");
  });

  it("reports a network failure instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const result = await requestMovieDelete(7, "Twin");
    expect(result.ok).toBe(false);
  });
});

describe("restoreMovieAt", () => {
  const a = makeMovie({ id: 1 });
  const b = makeMovie({ id: 2 });
  const c = makeMovie({ id: 3 });

  it("puts the movie back at its original position", () => {
    expect(restoreMovieAt([a, c], b, 1).map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("clamps an out-of-range index", () => {
    expect(restoreMovieAt([a], b, 99).map((m) => m.id)).toEqual([1, 2]);
    expect(restoreMovieAt([a], b, -3).map((m) => m.id)).toEqual([2, 1]);
  });

  it("does not duplicate a movie that is already there", () => {
    const list = [a, b];
    expect(restoreMovieAt(list, b, 0)).toBe(list);
  });
});
