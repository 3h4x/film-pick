"use client";

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
      className={`h-11 w-11 rounded-md border text-[11px] font-black transition-all sm:h-9 sm:w-9 ${
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

export default function RatingControls({
  globalRating,
  userRating,
  isRating,
  showRatingPicker,
  onTogglePicker,
  onRate,
}: RatingControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <div>
        <div className="flex items-center gap-3">
          <button
            onClick={onTogglePicker}
            title="My rating — click to change"
            aria-label={`My rating: ${userRating != null && userRating > 0 ? userRating : "none"}`}
            className="flex min-h-11 items-center gap-1.5 rounded-xl bg-indigo-500 px-3 py-0.5 text-lg font-black sm:min-h-9 text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-400"
          >
            ♥ {userRating != null && userRating > 0 ? userRating : "—"}
          </button>
        </div>
        {showRatingPicker && (
          <div className="flex flex-col gap-1 mt-2">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((rating) => (
                <RatingButton
                  key={rating}
                  rating={rating}
                  userRating={userRating}
                  isRating={isRating}
                  onRate={onRate}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              {[6, 7, 8, 9, 10].map((rating) => (
                <RatingButton
                  key={rating}
                  rating={rating}
                  userRating={userRating}
                  isRating={isRating}
                  onRate={onRate}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {globalRating != null && globalRating > 0 && (
        <div>
          <div className="flex items-center gap-3">
            <div
              title="Global rating"
              aria-label={`Global rating: ${globalRating}`}
              className="flex min-h-11 items-center rounded-xl bg-yellow-500 px-3 py-0.5 text-lg font-black text-black shadow-lg shadow-yellow-500/20 sm:min-h-9"
            >
              ★ {globalRating}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
