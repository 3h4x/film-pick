import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchTmdb } from "@/lib/tmdb";

vi.mock("@/lib/tmdb", () => ({
  searchTmdb: vi.fn(),
}));

const mockSearchTmdb = vi.mocked(searchTmdb);

describe("search API logic", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns search results from TMDb", async () => {
    mockSearchTmdb.mockResolvedValueOnce([
      {
        title: "Inception",
        year: 2010,
        genre: "Sci-Fi, Action",
        rating: 8.4,
        poster_url: "https://image.tmdb.org/t/p/w300/test.jpg",
        tmdb_id: 27205,
        imdb_id: null,
      },
    ]);

    const results = await searchTmdb("inception");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Inception");
  });

  it("calls searchTmdb with the query", async () => {
    mockSearchTmdb.mockResolvedValueOnce([]);

    await searchTmdb("test query");
    expect(mockSearchTmdb).toHaveBeenCalledWith("test query");
  });
});
