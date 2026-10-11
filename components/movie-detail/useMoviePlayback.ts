"use client";

import { useEffect, useState } from "react";
import type { MovieDetailMovie } from "@/components/movie-detail/types";
import { buildM3uPlaylist } from "@/lib/playback";

type PlayAction = "play" | "folder";

interface PlayResponse {
  ok?: boolean;
  error?: string;
  code?: string;
}

function partCount(movie: MovieDetailMovie): number {
  try {
    const extra = JSON.parse(movie.extra_files || "[]") as unknown;
    return 1 + (Array.isArray(extra) ? extra.length : 0);
  } catch {
    return 1;
  }
}

/** Hands the movie to the viewer's own player as an .m3u of stream URLs. */
function downloadPlaylist(movie: MovieDetailMovie) {
  const title = movie.title || "movie";
  const playlist = buildM3uPlaylist(
    window.location.origin,
    movie.id,
    title,
    partCount(movie),
  );
  const url = URL.createObjectURL(
    new Blob([playlist], { type: "audio/x-mpegurl" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "movie"}.m3u`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function useMoviePlayback(movie: MovieDetailMovie) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showEmbedded, setShowEmbedded] = useState(false);
  const [activePart, setActivePart] = useState(0);
  const [playError, setPlayError] = useState<string | null>(null);

  useEffect(() => {
    setIsPlaying(false);
    setShowEmbedded(false);
    setActivePart(0);
    setPlayError(null);
  }, [movie]);

  const handlePlay = async (action: PlayAction = "play") => {
    setPlayError(null);
    if (action === "play") setIsPlaying(true);

    try {
      const res = await fetch(`/api/movies/${movie.id}/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as PlayResponse;
      if (data.code === "NO_LOCAL_PLAYER" && action === "play") {
        // FilmPick runs on a server: let the viewer's VLC open the stream instead.
        downloadPlaylist(movie);
      } else if (!data.ok) {
        setPlayError(data.error || `Failed to ${action}`);
      }
    } catch {
      setPlayError(`Network error while trying to ${action}`);
    } finally {
      setIsPlaying(false);
    }
  };

  return {
    isPlaying,
    showEmbedded,
    setShowEmbedded,
    activePart,
    setActivePart,
    playError,
    handlePlay,
  };
}
