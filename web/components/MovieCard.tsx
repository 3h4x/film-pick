interface MovieCardProps {
  title: string;
  year: number | null;
  genre: string | null;
  rating: number | null;
  userRating: number | null;
  posterUrl: string | null;
  source: string | null;
  cdaUrl?: string | null;
  onDelete?: () => void;
  onClick?: () => void;
}

export default function MovieCard({
  title,
  year,
  genre,
  rating,
  userRating,
  posterUrl,
  source,
  cdaUrl,
  onDelete,
  onClick,
}: MovieCardProps) {
  return (
    <div
      className={`group relative rounded-xl overflow-hidden bg-gray-800/60 backdrop-blur-sm border border-gray-700/30 hover:border-indigo-500/40 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/5 hover:-translate-y-1 ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <div className="aspect-[2/3] bg-gray-800 relative overflow-hidden">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
            <span className="text-5xl opacity-30">🎬</span>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Rating badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {userRating != null && userRating > 0 && (
            <div className="bg-indigo-500/90 backdrop-blur-sm text-white text-xs font-semibold px-2 py-1 rounded-lg flex items-center gap-1">
              ♥ {userRating}/10
            </div>
          )}
          {rating != null && rating > 0 && (
            <div className="bg-black/70 backdrop-blur-sm text-yellow-400 text-xs font-semibold px-2 py-1 rounded-lg flex items-center gap-1">
              ★ {rating}
            </div>
          )}
        </div>

        {/* Delete button */}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="absolute top-2 right-2 bg-red-500/80 backdrop-blur-sm text-white rounded-lg w-7 h-7 text-xs font-bold opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-red-400 flex items-center justify-center"
          >
            ✕
          </button>
        )}

        {/* Source + CDA badges */}
        <div className="absolute bottom-2 right-2 flex gap-1">
          {cdaUrl && (
            <div className="text-[10px] font-medium px-2 py-0.5 bg-indigo-600/80 backdrop-blur-sm text-white rounded-md">
              CDA
            </div>
          )}
          {source && (
            <div className="text-[10px] font-medium px-2 py-0.5 bg-black/60 backdrop-blur-sm text-gray-300 rounded-md uppercase tracking-wider">
              {source}
            </div>
          )}
        </div>
      </div>

      <div className="p-3">
        <h3 className="text-white text-sm font-semibold truncate leading-tight">{title}</h3>
        <div className="flex items-center gap-2 mt-1.5">
          {year && <span className="text-gray-500 text-xs">{year}</span>}
          {genre && (
            <>
              <span className="text-gray-700 text-xs">·</span>
              <span className="text-gray-500 text-xs truncate">{genre}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
