"use client";

import { useEffect, useRef } from "react";

interface RatingControlsProps {
  globalRating: number | null;
  userRating: number | null;
  isRating: boolean;
  showRatingPicker: boolean;
  onTogglePicker: () => void;
  onRate: (rating: number) => void;
}

function RatingButton({
  rating,
  userRating,
  isRating,
  onRate,
}: {
  rating: number;
  userRating: number | null;
  isRating: boolean;
  onRate: (rating: number) => void;
}) {
  return (
    <button
      onClick={() => onRate(rating)}
      disabled={isRating}
      title={`Rate ${rating}/10`}
      className={`h-10 w-10 rounded-lg border text-xs font-black transition-all ${
        isRating ? "opacity-50 cursor-not-allowed" : "hover:scale-110 active:scale-95"
      } ${
        userRating === rating
          ? "bg-indigo-500 border-indigo-400 text-white"
          : "bg-gray-800 border-gray-700 text-gray-400 hover:border-indigo-500 hover:text-indigo-400"
      }`}
    >
      {rating}
    </button>
  );
}

/**
 * MY RATING (♥) and the global rating (★), side by side. The 1-10 picker floats
 * under the ♥ badge instead of opening inside the row, so nothing around it moves;
 * Escape or a click outside closes it.
 */
export default function RatingControls({
  globalRating,
  userRating,
  isRating,
  showRatingPicker,
  onTogglePicker,
  onRate,
}: RatingControlsProps) {
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showRatingPicker) return;
    const onPointer = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) onTogglePicker();
    };
    // Capture phase, and stop it there: the movie detail also closes on Escape, and
    // with the picker open Escape must close only the picker.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onTogglePicker();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [showRatingPicker, onTogglePicker]);

  const rated = userRating != null && userRating > 0;

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div ref={pickerRef} className="relative">
        <button
          onClick={onTogglePicker}
          title="My rating — click to change"
          aria-label={`My rating: ${rated ? userRating : "none"}`}
          aria-expanded={showRatingPicker}
          className="flex min-h-11 items-center gap-1.5 rounded-xl bg-indigo-500 px-3 py-0.5 text-lg font-black sm:min-h-9 text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-400"
        >
          ♥ {rated ? userRating : "—"}
        </button>
        {showRatingPicker && (
          <div
            role="group"
            aria-label="Choose your rating"
            className="absolute left-0 top-full z-30 mt-2 grid w-max grid-cols-5 gap-1 rounded-xl border border-gray-700/60 bg-gray-900/95 p-2 shadow-2xl shadow-black/50 backdrop-blur sm:grid-cols-10"
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((rating) => (
              <RatingButton
                key={rating}
                rating={rating}
                userRating={userRating}
                isRating={isRating}
                onRate={onRate}
              />
            ))}
          </div>
        )}
      </div>

      {globalRating != null && globalRating > 0 && (
        <div
          title="Global rating"
          aria-label={`Global rating: ${globalRating}`}
          className="flex min-h-11 items-center rounded-xl bg-yellow-500 px-3 py-0.5 text-lg font-black text-black shadow-lg shadow-yellow-500/20 sm:min-h-9"
        >
          ★ {globalRating}
        </div>
      )}
    </div>
  );
}
