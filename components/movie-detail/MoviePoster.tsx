"use client";

interface MoviePosterProps {
  title: string;
  posterUrl: string | null;
  filePath?: string | null;
  showEmbedded?: boolean;
  size?: "desktop" | "mobile";
  onEmbed?: () => void;
}

function hideBrokenPoster(image: HTMLImageElement) {
  image.style.display = "none";
  image.parentElement?.classList.add(
    "flex",
    "items-center",
    "justify-center",
    "bg-gray-800",
  );

  const span = document.createElement("span");
  span.className = "text-6xl opacity-30";
  span.innerText = "🎬";
  image.parentElement?.appendChild(span);
}

function PlayOverlay({ title, onEmbed }: { title: string; onEmbed?: () => void }) {
  return (
    <button
      type="button"
      onClick={onEmbed}
      aria-label={`Play ${title}`}
      className="group/play absolute inset-0 flex items-center justify-center rounded-2xl bg-black/20 transition-colors hover:bg-black/45 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-400/60"
    >
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-500/90 shadow-2xl shadow-black/60 ring-4 ring-white/15 backdrop-blur-sm transition-transform group-hover/play:scale-110 group-hover/play:bg-indigo-500 group-active/play:scale-95 lg:h-24 lg:w-24">
        <svg viewBox="0 0 24 24" className="ml-1.5 h-9 w-9 fill-white lg:h-11 lg:w-11" aria-hidden="true">
          <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.6-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z" />
        </svg>
      </span>
    </button>
  );
}

export default function MoviePoster({
  title,
  posterUrl,
  filePath,
  showEmbedded = false,
  size = "desktop",
  onEmbed,
}: MoviePosterProps) {
  const canPlay = Boolean(filePath && onEmbed) && !showEmbedded;
  const poster = (
    <div className="relative">
      {posterUrl ? (
        <div className="relative aspect-[2/3]">
          <img
            src={posterUrl}
            alt={title}
            className="w-full h-full object-cover rounded-2xl shadow-2xl border border-gray-700/30"
            onError={(event) => hideBrokenPoster(event.currentTarget)}
          />
        </div>
      ) : (
        <div className="w-full aspect-[2/3] bg-gray-800 rounded-2xl flex items-center justify-center border border-gray-700/30">
          <span className="text-6xl opacity-30">🎬</span>
        </div>
      )}
      {canPlay && <PlayOverlay title={title} onEmbed={onEmbed} />}
    </div>
  );

  if (size === "mobile") {
    return <div className="lg:hidden mx-auto w-full max-w-[220px]">{poster}</div>;
  }

  return <div className="hidden lg:block flex-shrink-0">{poster}</div>;
}
