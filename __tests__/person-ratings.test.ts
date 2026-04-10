import { describe, it, expect } from "vitest";
import { buildPersonMap } from "@/app/api/person-ratings/route";

interface RatedMovie {
  id: number;
  title: string;
  year: number | null;
  director: string | null;
  writer: string | null;
  actors: string | null;
  user_rating: number;
}

function makeMovie(overrides: Partial<RatedMovie> & { title: string; user_rating: number }): RatedMovie {
  return {
    id: 1,
    year: 2020,
    director: null,
    writer: null,
    actors: null,
    ...overrides,
  };
}

describe("buildPersonMap", () => {
  it("returns empty map for empty input", () => {
    expect(buildPersonMap([])).toEqual(new Map());
  });

  it("creates a director entry from a movie", () => {
    const movies = [makeMovie({ id: 1, title: "Inception", director: "Christopher Nolan", user_rating: 9 })];
    const map = buildPersonMap(movies);
    const entry = map.get("Christopher Nolan::director");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("Christopher Nolan");
    expect(entry!.role).toBe("director");
    expect(entry!.movie_count).toBe(1);
    expect(entry!.avg_rating).toBe(9);
  });

  it("creates an actor entry from a movie", () => {
    const movies = [makeMovie({ id: 1, title: "Inception", actors: "Leonardo DiCaprio", user_rating: 9 })];
    const map = buildPersonMap(movies);
    const entry = map.get("Leonardo DiCaprio::actor");
    expect(entry).toBeDefined();
    expect(entry!.role).toBe("actor");
    expect(entry!.movie_count).toBe(1);
  });

  it("creates a writer entry from a movie", () => {
    const movies = [makeMovie({ id: 1, title: "Inception", writer: "Christopher Nolan", user_rating: 9 })];
    const map = buildPersonMap(movies);
    const entry = map.get("Christopher Nolan::writer");
    expect(entry).toBeDefined();
    expect(entry!.role).toBe("writer");
  });

  it("handles multiple comma-separated directors", () => {
    const movies = [makeMovie({ id: 1, title: "Movie", director: "Director A, Director B", user_rating: 8 })];
    const map = buildPersonMap(movies);
    expect(map.has("Director A::director")).toBe(true);
    expect(map.has("Director B::director")).toBe(true);
  });

  it("accumulates movies for the same person across multiple films", () => {
    const movies = [
      makeMovie({ id: 1, title: "Inception", director: "Christopher Nolan", user_rating: 9 }),
      makeMovie({ id: 2, title: "Interstellar", director: "Christopher Nolan", user_rating: 10 }),
    ];
    const map = buildPersonMap(movies);
    const entry = map.get("Christopher Nolan::director");
    expect(entry!.movie_count).toBe(2);
    expect(entry!.movies).toHaveLength(2);
  });

  it("calculates avg_rating correctly", () => {
    const movies = [
      makeMovie({ id: 1, title: "Film A", director: "Jane Doe", user_rating: 8 }),
      makeMovie({ id: 2, title: "Film B", director: "Jane Doe", user_rating: 6 }),
    ];
    const map = buildPersonMap(movies);
    const entry = map.get("Jane Doe::director");
    expect(entry!.avg_rating).toBe(7);
  });

  it("rounds avg_rating to one decimal place", () => {
    const movies = [
      makeMovie({ id: 1, title: "Film A", director: "Jane Doe", user_rating: 7 }),
      makeMovie({ id: 2, title: "Film B", director: "Jane Doe", user_rating: 8 }),
      makeMovie({ id: 3, title: "Film C", director: "Jane Doe", user_rating: 9 }),
    ];
    const map = buildPersonMap(movies);
    // (7+8+9)/3 = 8.0
    expect(map.get("Jane Doe::director")!.avg_rating).toBe(8);

    const moviesOdd = [
      makeMovie({ id: 4, title: "Film D", director: "John Doe", user_rating: 7 }),
      makeMovie({ id: 5, title: "Film E", director: "John Doe", user_rating: 8 }),
    ];
    const map2 = buildPersonMap(moviesOdd);
    // (7+8)/2 = 7.5
    expect(map2.get("John Doe::director")!.avg_rating).toBe(7.5);
  });

  it("treats same person in different roles as separate entries", () => {
    const movies = [
      makeMovie({ id: 1, title: "Film", director: "Orson Welles", actors: "Orson Welles", user_rating: 9 }),
    ];
    const map = buildPersonMap(movies);
    expect(map.has("Orson Welles::director")).toBe(true);
    expect(map.has("Orson Welles::actor")).toBe(true);
    expect(map.get("Orson Welles::director")!.role).toBe("director");
    expect(map.get("Orson Welles::actor")!.role).toBe("actor");
  });

  it("filters by filterNames (single name)", () => {
    const movies = [
      makeMovie({ id: 1, title: "Inception", director: "Christopher Nolan", user_rating: 9 }),
      makeMovie({ id: 2, title: "Parasite", director: "Bong Joon-ho", user_rating: 10 }),
    ];
    const filter = new Set(["christopher nolan"]);
    const map = buildPersonMap(movies, filter);
    expect(map.has("Christopher Nolan::director")).toBe(true);
    expect(map.has("Bong Joon-ho::director")).toBe(false);
  });

  it("filterNames set must contain pre-lowercased values (matches how route uses it)", () => {
    const movies = [makeMovie({ id: 1, title: "Film", director: "Stanley Kubrick", user_rating: 9 })];
    // The route lowercases query params before building the Set — the function checks personName.toLowerCase()
    const filter = new Set(["stanley kubrick"]);
    const map = buildPersonMap(movies, filter);
    expect(map.has("Stanley Kubrick::director")).toBe(true);
  });

  it("returns empty map when filterNames does not match any person", () => {
    const movies = [makeMovie({ id: 1, title: "Film", director: "Stanley Kubrick", user_rating: 9 })];
    const filter = new Set(["no one"]);
    const map = buildPersonMap(movies, filter);
    expect(map.size).toBe(0);
  });

  it("includes correct movie metadata in the movies array", () => {
    const movies = [makeMovie({ id: 42, title: "The Godfather", year: 1972, director: "Francis Ford Coppola", user_rating: 10 })];
    const map = buildPersonMap(movies);
    const entry = map.get("Francis Ford Coppola::director");
    expect(entry!.movies[0]).toEqual({ id: 42, title: "The Godfather", year: 1972, user_rating: 10 });
  });

  it("ignores movies with null director/writer/actors", () => {
    const movies = [makeMovie({ id: 1, title: "Mystery Film", director: null, writer: null, actors: null, user_rating: 5 })];
    expect(buildPersonMap(movies).size).toBe(0);
  });

  it("handles whitespace-only comma-separated values", () => {
    const movies = [makeMovie({ id: 1, title: "Film", director: "  ,  , Valid Name", user_rating: 7 })];
    const map = buildPersonMap(movies);
    // Only "Valid Name" should be added; empty strings after trim are filtered
    expect(map.has("Valid Name::director")).toBe(true);
    expect(map.size).toBe(1);
  });
});
