import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SearchView from "@/components/views/SearchView";
import type { TmdbSearchResult } from "@/lib/tmdb";

const film: TmdbSearchResult = { title: "Sample Film", year: 2026, genre: "Drama", rating: 8.9, poster_url: null, tmdb_id: 501, imdb_id: null };
const show: TmdbSearchResult = { ...film, media_type: "tv", title: "Sample Show", tmdb_id: 502 };

function render(dismissed: number[] = []) {
  return renderToStaticMarkup(
    createElement(SearchView, {
      searchQuery: "sample",
      movies: [],
      tmdbResults: [film, show],
      tmdbLoading: false,
      tmdbAdded: new Set<number>(),
      tmdbError: null,
      tmdbSearched: true,
      onMovieClick: vi.fn(),
      onTmdbResultClick: vi.fn(),
      onClear: vi.fn(),
      onGoToConfig: vi.fn(),
      onSearchTmdb: vi.fn(),
      onAddToLibrary: vi.fn(),
      onAddToWatchlist: vi.fn(),
      tmdbDismissed: new Set(dismissed),
      onToggleNotInterested: vi.fn(),
    }),
  );
}

describe("SearchView: not interested", () => {
  it("offers ✕ on films, not on series", () => {
    const html = render();
    expect(html).toContain('aria-label="Not interested in Sample Film"');
    expect(html).not.toContain('aria-label="Not interested in Sample Show"');
  });

  it("shows a dismissed film as not interested, with an undo, instead of the buttons", () => {
    const html = render([501]);
    expect(html).toContain('aria-label="Undo not interested in Sample Film"');
    expect(html).toContain("✕ Not interested");
    expect(html).not.toContain('aria-label="Add Sample Film to library"');
    expect(html).toContain('aria-label="Add Sample Show to library"');
  });
});
