"use client";

interface WatchlistButtonProps {
  onWatchlist: boolean;
  isSaving: boolean;
  onToggle: () => void;
}

export default function WatchlistButton({ onWatchlist, isSaving, onToggle }: WatchlistButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isSaving}
      aria-pressed={onWatchlist}
      title={onWatchlist ? "On your watchlist — click to remove" : "Add to watchlist (want to watch)"}
      className={`flex min-h-11 items-center gap-1.5 rounded-xl border px-3 py-0.5 text-sm font-bold transition-colors sm:min-h-9 ${
        isSaving ? "cursor-wait opacity-60" : ""
      } ${
        onWatchlist
          ? "border-blue-400/40 bg-blue-500/20 text-blue-200 hover:bg-blue-500/30"
          : "border-gray-700 bg-gray-800/70 text-gray-300 hover:border-blue-400/50 hover:text-blue-200"
      }`}
    >
      🔖 {onWatchlist ? "On watchlist" : "Want to watch"}
    </button>
  );
}
