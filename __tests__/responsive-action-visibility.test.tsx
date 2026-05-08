import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CARD_ACTION_ICON_SIZE_CLASS,
  CARD_ACTION_TOUCH_TARGET_CLASS,
} from "@/components/card-action-styles";
import RecommendationRow from "@/components/RecommendationRow";
import MovieCard from "@/components/MovieCard";
import RecommendationsView from "@/components/views/RecommendationsView";
import WishlistView from "@/components/views/WishlistView";
import type { Movie, RecommendationGroup } from "@/lib/types";
import type { TmdbSearchResult } from "@/lib/tmdb";

const HOVER_REVEAL_REC_CLASS =
  "hidden flex-col gap-1 opacity-0 transition-all duration-200 [@media(hover:hover)]:flex [@media(hover:hover)]:group-hover/rec:opacity-100";
const HOVER_REVEAL_WISH_CLASS =
  "[@media(hover:hover)]:group-hover/wish:opacity-100";
const HOVER_REVEAL_LIBRARY_CLASS =
  "hidden flex-col gap-1 opacity-0 transition-all duration-200 [@media(hover:hover)]:flex [@media(hover:hover)]:group-hover:opacity-100";

const rec: TmdbSearchResult = {
  title: "Heat",
  year: 1995,
  genre: "Crime",
  rating: 8.3,
  poster_url: null,
  tmdb_id: 949,
  imdb_id: "tt0113277",
};

const moodGroups: RecommendationGroup[] = [
  {
    reason: "For tense nights",
    type: "mood",
    recommendations: [rec],
  },
];

const wishlistMovie: Movie = {
  id: 1,
  title: "Heat",
  year: 1995,
  genre: "Crime",
  director: null,
  writer: null,
  actors: null,
  rating: 8.3,
  user_rating: null,
  poster_url: null,
  source: "tmdb",
  type: "movie",
  tmdb_id: 949,
  rated_at: null,
  created_at: "2026-05-04T00:00:00.000Z",
};

function createRecommendationsViewProps(): ComponentProps<
  typeof RecommendationsView
> {
  return {
    hasMovies: true,
    disabledEngines: [],
    invalidMoodKey: null,
    clearInvalidMood: vi.fn(),
    recs: {
      recGroups: {},
      setRecGroups: vi.fn(),
      recLoading: {},
      totalRecsCount: 0,
      setTotalRecsCount: vi.fn(),
      recsLoading: false,
      recommendations: [],
      moodGroups,
      moodLoading: false,
      moodError: null,
      recCategory: "all",
      activeMood: "comfort_rewatch",
      groupOrder: [],
      setGroupOrder: vi.fn(),
      categoryCounts: {},
      lastRecsRefresh: null,
      engineDropdownOpen: false,
      setEngineDropdownOpen: vi.fn(),
      moodDropdownOpen: false,
      setMoodDropdownOpen: vi.fn(),
      setRecCategory: vi.fn(),
      setActiveMood: vi.fn(),
      fetchEngine: vi.fn(async () => {}),
      refreshRecs: vi.fn(),
      removeFromView: vi.fn(),
      handleRecAction: vi.fn(),
      handleRecClick: vi.fn(async () => {}),
    },
  };
}

describe("responsive action visibility", () => {
  it("keeps grouped recommendation actions hover-gated by input capability instead of md width", () => {
    const html = renderToStaticMarkup(
      <RecommendationRow
        reason="Because you liked crime"
        type="movie"
        recommendations={[rec]}
        onAction={vi.fn()}
        onClickMovie={vi.fn()}
      />,
    );

    expect(html).toContain(HOVER_REVEAL_REC_CLASS);
    expect(html).toContain("Show actions");
    expect(html).not.toContain("md:[@media(hover:hover)]");
  });

  it("keeps mood recommendation actions hover-gated by input capability instead of md width", () => {
    const html = renderToStaticMarkup(
      <RecommendationsView {...createRecommendationsViewProps()} />,
    );

    expect(html).toContain(HOVER_REVEAL_REC_CLASS);
    expect(html).toContain("Show actions");
    expect(html).not.toContain("md:[@media(hover:hover)]");
  });

  it("keeps watchlist actions hover-gated by input capability instead of md width", () => {
    const html = renderToStaticMarkup(
      <WishlistView
        wishlistMovies={[wishlistMovie]}
        onMovieClick={vi.fn()}
        onAction={vi.fn()}
      />,
    );

    expect(html).toContain(HOVER_REVEAL_WISH_CLASS);
    expect(html).toContain("Show actions");
    expect(html).not.toContain("md:[@media(hover:hover)]");
  });

  it("uses the compact mobile action toggle for library cards", () => {
    const html = renderToStaticMarkup(
      <MovieCard
        title="Heat"
        year={1995}
        genre="Crime"
        rating={8.3}
        userRating={null}
        posterUrl={null}
        source="tmdb"
        onAddToWatchlist={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(html).toContain(HOVER_REVEAL_LIBRARY_CLASS);
    expect(html).toContain("Show actions");
    expect(html).toContain(CARD_ACTION_TOUCH_TARGET_CLASS);
    expect(html).not.toContain("md:[@media(hover:hover)]");
  });

  it("shares the mobile touch-target classes across card action entrypoints", () => {
    expect(CARD_ACTION_TOUCH_TARGET_CLASS).toBe("h-11 w-11 sm:h-9 sm:w-9");
    expect(CARD_ACTION_ICON_SIZE_CLASS).toBe("text-base sm:text-sm");
  });
});
