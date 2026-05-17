"use client";

import CardActionStack from "./CardActionStack";
import MovieCard from "./MovieCard";
import {
  CARD_ACTION_ICON_SIZE_CLASS,
  CARD_ACTION_TOUCH_TARGET_CLASS,
} from "./card-action-styles";
import type { RecType } from "@/lib/types";
import type { TmdbSearchResult } from "@/lib/tmdb";

export type RecAction =
  | "liked"
  | "watched"
  | "disliked"
  | "dismiss"
  | "wishlist";

interface RecommendationRowProps {
  reason: string;
  type: RecType;
  recommendations: TmdbSearchResult[];
  onAction: (
    tmdbId: number,
    action: RecAction,
    rec: TmdbSearchResult,
    engine?: RecType,
  ) => void;
  onClickMovie: (rec: TmdbSearchResult, engine?: RecType) => void | Promise<void>;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  genre: "🎭",
  director: "🎬",
  actor: "⭐",
  movie: "💡",
  hidden_gem: "💎",
  star_studded: "🌟",
  random: "🎲",
};

export default function RecommendationRow({
  reason,
  type,
  recommendations,
  onAction,
  onClickMovie,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: RecommendationRowProps) {
  const reorderButtonClass =
    "flex h-11 w-11 items-center justify-center rounded-lg border border-gray-800/80 bg-gray-900/70 transition-colors sm:h-8 sm:w-8 sm:border-transparent sm:bg-transparent";

  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex flex-col -my-1">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className={`${reorderButtonClass} ${isFirst ? "cursor-default text-gray-700" : "text-gray-500 hover:bg-gray-800/80 hover:text-white"}`}
            title="Move up"
          >
            <svg
              className="h-4 w-4 sm:h-3.5 sm:w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 15l7-7 7 7"
              />
            </svg>
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className={`${reorderButtonClass} ${isLast ? "cursor-default text-gray-700" : "text-gray-500 hover:bg-gray-800/80 hover:text-white"}`}
            title="Move down"
          >
            <svg
              className="h-4 w-4 sm:h-3.5 sm:w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
        <div className="w-1 h-5 bg-indigo-500 rounded-full" />
        <span className="text-base">{TYPE_ICONS[type] || "💡"}</span>
        <h3 className="text-white font-semibold text-base">{reason}</h3>
        <span className="text-gray-600 text-xs">
          {recommendations.length} titles
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {recommendations.map((r) => (
          <div key={r.tmdb_id} className="relative group/rec">
            <MovieCard
              title={r.title}
              year={r.year}
              genre={r.genre}
              rating={r.rating}
              userRating={null}
              posterUrl={r.poster_url}
              source="tmdb"
              cdaUrl={r.cda_url}
              onClick={() => onClickMovie(r, type)}
            />
            <CardActionStack
              actions={[
                {
                  key: "liked",
                  label: "Watched & liked",
                  icon: "👍",
                  className:
                    `bg-green-600/90 backdrop-blur-sm text-white rounded-lg ${CARD_ACTION_TOUCH_TARGET_CLASS} ${CARD_ACTION_ICON_SIZE_CLASS} flex items-center justify-center hover:bg-green-500 transition-colors`,
                  onClick: () => onAction(r.tmdb_id, "liked", r, type),
                },
                {
                  key: "watched",
                  label: "Watched",
                  icon: "👁",
                  className:
                    `bg-gray-600/90 backdrop-blur-sm text-white rounded-lg ${CARD_ACTION_TOUCH_TARGET_CLASS} ${CARD_ACTION_ICON_SIZE_CLASS} flex items-center justify-center hover:bg-gray-500 transition-colors`,
                  onClick: () => onAction(r.tmdb_id, "watched", r, type),
                },
                {
                  key: "wishlist",
                  label: "Add to watchlist",
                  icon: "🔖",
                  className:
                    `bg-blue-600/90 backdrop-blur-sm text-white rounded-lg ${CARD_ACTION_TOUCH_TARGET_CLASS} ${CARD_ACTION_ICON_SIZE_CLASS} flex items-center justify-center hover:bg-blue-500 transition-colors`,
                  onClick: () => onAction(r.tmdb_id, "wishlist", r, type),
                },
                {
                  key: "disliked",
                  label: "Watched & disliked",
                  icon: "👎",
                  className:
                    `bg-orange-600/90 backdrop-blur-sm text-white rounded-lg ${CARD_ACTION_TOUCH_TARGET_CLASS} ${CARD_ACTION_ICON_SIZE_CLASS} flex items-center justify-center hover:bg-orange-500 transition-colors`,
                  onClick: () => onAction(r.tmdb_id, "disliked", r, type),
                },
                {
                  key: "dismiss",
                  label: "Don't show again",
                  icon: "✕",
                  className:
                    `bg-red-600/90 backdrop-blur-sm text-white rounded-lg ${CARD_ACTION_TOUCH_TARGET_CLASS} ${CARD_ACTION_ICON_SIZE_CLASS} flex items-center justify-center hover:bg-red-500 transition-colors`,
                  onClick: () => onAction(r.tmdb_id, "dismiss", r, type),
                },
              ]}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
