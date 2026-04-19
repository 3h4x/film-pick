import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/tmdb", () => ({
  searchTmdb: vi.fn(),
}));

import { GET } from "@/app/api/search/route";
import { searchTmdb } from "@/lib/tmdb";

const mockSearchTmdb = vi.mocked(searchTmdb);

function makeRequest(query?: string) {
  const url = query !== undefined
    ? `http://localhost/api/search?q=${encodeURIComponent(query)}`
    : "http://localhost/api/search";
  return new NextRequest(url);
}

const sampleResults = [
  {
    title: "Inception",
    year: 2010,
    genre: "Sci-Fi, Action",
    rating: 8.4,
    poster_url: "https://image.tmdb.org/t/p/w300/test.jpg",
    tmdb_id: 27205,
    imdb_id: null,
  },
];

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns empty array when query is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
    expect(mockSearchTmdb).not.toHaveBeenCalled();
  });

  it("returns empty array when query is empty string", async () => {
    const res = await GET(makeRequest(""));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
    expect(mockSearchTmdb).not.toHaveBeenCalled();
  });

  it("returns empty array when query is whitespace only", async () => {
    const res = await GET(makeRequest("   "));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
    expect(mockSearchTmdb).not.toHaveBeenCalled();
  });

  it("returns search results for a valid query", async () => {
    mockSearchTmdb.mockResolvedValueOnce(sampleResults);

    const res = await GET(makeRequest("inception"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Inception");
    expect(body[0].tmdb_id).toBe(27205);
    expect(mockSearchTmdb).toHaveBeenCalledWith("inception");
  });

  it("passes the exact query string to searchTmdb", async () => {
    mockSearchTmdb.mockResolvedValueOnce([]);

    await GET(makeRequest("The Dark Knight"));
    expect(mockSearchTmdb).toHaveBeenCalledWith("The Dark Knight");
  });

  it("returns empty array when TMDb finds no results", async () => {
    mockSearchTmdb.mockResolvedValueOnce([]);

    const res = await GET(makeRequest("xyzzy-nonexistent-film-12345"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns 503 with no_api_key when TMDB_API_KEY is not set", async () => {
    mockSearchTmdb.mockRejectedValueOnce(new Error("TMDB_API_KEY not set"));

    const res = await GET(makeRequest("inception"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("no_api_key");
  });

  it("returns 503 with no_api_key for tmdb_api_error", async () => {
    mockSearchTmdb.mockRejectedValueOnce(new Error("tmdb_api_error: 401 Unauthorized"));

    const res = await GET(makeRequest("inception"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("no_api_key");
  });

  it("returns 500 for unexpected errors", async () => {
    mockSearchTmdb.mockRejectedValueOnce(new Error("Network timeout"));

    const res = await GET(makeRequest("inception"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Network timeout");
  });

  it("returns 500 with generic message when error has no message", async () => {
    mockSearchTmdb.mockRejectedValueOnce({});

    const res = await GET(makeRequest("inception"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Search failed");
  });

  it("returns multiple results preserving order", async () => {
    const multiResults = [
      { ...sampleResults[0] },
      { title: "Inception 2", year: 2025, genre: "Sci-Fi", rating: 7.5, poster_url: null, tmdb_id: 99999, imdb_id: null },
    ];
    mockSearchTmdb.mockResolvedValueOnce(multiResults);

    const res = await GET(makeRequest("inception"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].title).toBe("Inception");
    expect(body[1].title).toBe("Inception 2");
  });
});
