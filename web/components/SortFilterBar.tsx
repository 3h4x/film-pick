"use client";

type SortOption = "user_rating" | "rating" | "year" | "title" | "created_at" | "rated_at";

interface SortFilterBarProps {
  sort: SortOption;
  sortDir: "asc" | "desc";
  genre: string;
  genres: string[];
  searchQuery: string;
  onSortChange: (sort: SortOption) => void;
  onSortDirChange: () => void;
  onGenreChange: (genre: string) => void;
  onSearchChange: (query: string) => void;
}

const SORT_LABELS: Record<SortOption, string> = {
  user_rating: "My Rating",
  rating: "Global Rating",
  year: "Year",
  title: "Title",
  created_at: "Date Added",
  rated_at: "Date Rated",
};

export default function SortFilterBar({
  sort,
  sortDir,
  genre,
  genres,
  searchQuery,
  onSortChange,
  onSortDirChange,
  onGenreChange,
  onSearchChange,
}: SortFilterBarProps) {
  return (
    <div className="space-y-3 mb-6">
      {/* Search */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search your library..."
        className="w-full max-w-sm bg-gray-800/60 text-white text-sm px-4 py-2.5 rounded-xl border border-gray-700/50 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 focus:outline-none placeholder-gray-600"
      />

      {/* Sort + filter row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Sort buttons — scrollable on mobile */}
        <div className="flex items-center gap-1 bg-gray-800/40 p-1 rounded-xl overflow-x-auto max-w-full">
          {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
            <button
              key={key}
              onClick={() => onSortChange(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                sort === key
                  ? "bg-gray-700/80 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-300 hover:bg-gray-700/30"
              }`}
            >
              {SORT_LABELS[key]}
            </button>
          ))}
          <button
            onClick={onSortDirChange}
            className="px-2 py-1.5 text-xs text-gray-400 hover:text-white rounded-lg hover:bg-gray-700/30 transition-all flex-shrink-0"
            title={sortDir === "desc" ? "Descending" : "Ascending"}
          >
            {sortDir === "desc" ? "↓" : "↑"}
          </button>
        </div>

        {/* Genre filter */}
        {genres.length > 0 && (
          <select
            value={genre}
            onChange={(e) => onGenreChange(e.target.value)}
            className="bg-gray-800/60 text-gray-300 text-xs px-3 py-2 rounded-xl border border-gray-700/50 focus:border-indigo-500/50 focus:outline-none appearance-none cursor-pointer"
          >
            <option value="">All Genres</option>
            {genres.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
