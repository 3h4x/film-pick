"use client";

import type { ReactNode } from "react";

interface QuickLinksProps {
  title: string;
  year: number | null;
  tmdbId?: number | null;
  filmwebUrl?: string | null;
  cdaUrl?: string | null;
  plTitle: string | null;
}

// Simple inline marks (not the official brand assets) so each service is
// recognisable at a glance without shipping image files.
function BrandMark({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] font-black leading-none ${className}`}
    >
      {children}
    </span>
  );
}

const TmdbMark = () => (
  <BrandMark className="bg-gradient-to-r from-[#90cea1] to-[#01b4e4] tracking-tight text-[#0d253f]">
    TMDb
  </BrandMark>
);

const CdaMark = () => (
  <BrandMark className="bg-[#f5a623] lowercase text-black">cda</BrandMark>
);

const FilmwebMark = () => (
  <BrandMark className="bg-[#ffc200] text-black">f</BrandMark>
);

const YouTubeMark = () => (
  <span aria-hidden="true" className="flex h-5 w-7 items-center justify-center rounded-md bg-[#ff0000]">
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="white">
      <path d="M2 1l7 4-7 4z" />
    </svg>
  </span>
);

const LINK_CLASS =
  "flex min-h-9 items-center gap-2 rounded-lg border border-gray-600/50 bg-gray-800/70 py-1 pl-1.5 pr-3 text-xs font-bold text-gray-200 transition-all hover:border-gray-400/60 hover:bg-gray-700/70 hover:text-white";

function QuickLink({ href, mark, label }: { href: string; mark: ReactNode; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
      {mark}
      {label}
    </a>
  );
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
    <nav aria-label="Quick links" className="flex flex-wrap gap-2">
      {tmdbId && (
        <QuickLink
          href={`https://www.themoviedb.org/movie/${tmdbId}`}
          mark={<TmdbMark />}
          label="TMDb"
        />
      )}
      {filmwebUrl && (
        <QuickLink href={filmwebUrl} mark={<FilmwebMark />} label="Filmweb" />
      )}
      <QuickLink
        href={cdaUrl || `https://www.cda.pl/szukaj?q=${encodeURIComponent(plTitle || title)}`}
        mark={<CdaMark />}
        label="CDA.pl"
      />
      <QuickLink
        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(title + (year ? ` ${year}` : "") + " trailer")}`}
        mark={<YouTubeMark />}
        label="YouTube"
      />
    </nav>
  );
}
