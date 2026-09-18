"use client";

interface QuickLinksProps {
  title: string;
  year: number | null;
  tmdbId?: number | null;
  filmwebUrl?: string | null;
  cdaUrl?: string | null;
  plTitle: string | null;
}

export default function QuickLinks({
  title,
  year,
  tmdbId,
  filmwebUrl,
  cdaUrl,
  plTitle,
}: QuickLinksProps) {
  return (
    <nav aria-label="Quick links">
      <div className="flex flex-wrap gap-2">
        {tmdbId && (
          <a
            href={`https://www.themoviedb.org/movie/${tmdbId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-gray-800/50 hover:bg-gray-800 border border-gray-700/30 hover:border-blue-500/30 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-400 hover:text-blue-400 transition-all text-center"
          >
            TMDb
          </a>
        )}
        {filmwebUrl && (
          <a
            href={filmwebUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-gray-800/50 hover:bg-gray-800 border border-gray-700/30 hover:border-indigo-500/30 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-400 hover:text-indigo-400 transition-all text-center"
          >
            Filmweb
          </a>
        )}
        <a
          href={cdaUrl || `https://www.cda.pl/szukaj?q=${encodeURIComponent(plTitle || title)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-gray-800/50 hover:bg-gray-800 border border-gray-700/30 hover:border-indigo-500/30 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-400 hover:text-indigo-400 transition-all text-center"
        >
          CDA.pl
        </a>
        <a
          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(title + (year ? ` ${year}` : "") + " trailer")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-gray-800/50 hover:bg-gray-800 border border-gray-700/30 hover:border-red-500/30 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-400 hover:text-red-400 transition-all text-center"
        >
          Trailer
        </a>
      </div>
    </nav>
  );
}
