"use client";

import { useState } from "react";

export function useMoviePlayback(movieId: number, filePath: string | null) {
  const [selection, setSelection] = useState({ movieId, filePath, showEmbedded: false, activePart: 0 });
  const isCurrent = selection.movieId === movieId && selection.filePath === filePath;
  if (!isCurrent) setSelection({ movieId, filePath, showEmbedded: false, activePart: 0 });
  const showEmbedded = isCurrent && selection.showEmbedded;
  const activePart = isCurrent ? selection.activePart : 0;

  return {
    showEmbedded,
    activePart,
    setShowEmbedded: (open: boolean) =>
      setSelection({ movieId, filePath, showEmbedded: open, activePart }),
    setActivePart: (part: number) =>
      setSelection({ movieId, filePath, showEmbedded, activePart: part }),
  };
}
