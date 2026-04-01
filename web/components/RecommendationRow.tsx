"use client";

import MovieCard from "./MovieCard";

interface Recommendation {
  title: string;
  year: number | null;
  genre: string;
  rating: number;
  poster_url: string | null;
  tmdb_id: number;
  cda_url?: string;
}

export type RecAction = "liked" | "watched" | "disliked" | "dismiss" | "wishlist";

interface RecommendationRowProps {
  reason: string;
  type: string;
  recommendations: Recommendation[];
  onAction: (tmdbId: number, action: RecAction, rec: Recommendation) => void;
  onClickMovie: (rec: Recommendation) => void;
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
}: RecommendationRowProps) {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-1 h-5 bg-indigo-500 rounded-full" />
        <span className="text-base">{TYPE_ICONS[type] || "💡"}</span>
        <h3 className="text-white font-semibold text-base">{reason}</h3>
        <span className="text-gray-600 text-xs">{recommendations.length} titles</span>
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
              onClick={() => onClickMovie(r)}
            />
            {/* Action buttons — appear on hover */}
            <div className="absolute bottom-14 right-1 flex flex-col gap-1 opacity-0 group-hover/rec:opacity-100 transition-all duration-200">
              <button
                onClick={() => onAction(r.tmdb_id, "liked", r)}
                className="bg-green-600/90 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-sm flex items-center justify-center hover:bg-green-500 transition-colors"
                title="Watched &amp; liked"
              >
                👍
              </button>
              <button
                onClick={() => onAction(r.tmdb_id, "watched", r)}
                className="bg-gray-600/90 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-sm flex items-center justify-center hover:bg-gray-500 transition-colors"
                title="Watched"
              >
                👁
              </button>
              <button
                onClick={() => onAction(r.tmdb_id, "wishlist", r)}
                className="bg-blue-600/90 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-sm flex items-center justify-center hover:bg-blue-500 transition-colors"
                title="Add to watchlist"
              >
                🔖
              </button>
              <button
                onClick={() => onAction(r.tmdb_id, "disliked", r)}
                className="bg-orange-600/90 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-sm flex items-center justify-center hover:bg-orange-500 transition-colors"
                title="Watched &amp; disliked"
              >
                👎
              </button>
              <button
                onClick={() => onAction(r.tmdb_id, "dismiss", r)}
                className="bg-red-600/90 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-sm flex items-center justify-center hover:bg-red-500 transition-colors"
                title="Don't show again"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
