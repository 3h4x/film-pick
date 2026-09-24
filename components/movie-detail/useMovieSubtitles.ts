"use client";

import { useEffect, useState, type DragEvent } from "react";
import type {
  SubtitleNotice,
  SubtitleTrack,
} from "@/components/movie-detail/types";
import { getErrorMessage } from "@/lib/utils";

interface SubtitlesResponse {
  hasSubtitles: boolean;
  subtitles?: SubtitleTrack[];
}

interface SubtitleUploadResponse {
  ok?: boolean;
  fileName?: string;
  path?: string;
  error?: string;
}

interface SubtitleDownloadResponse {
  ok?: boolean;
  fileName?: string;
  path?: string;
  provider?: "napiprojekt" | "opensubtitles";
  hashMatch?: boolean;
  error?: string;
}

const PROVIDER_LABELS = {
  napiprojekt: "NapiProjekt",
  opensubtitles: "OpenSubtitles",
} as const;

/**
 * What to tell the user after a download. A title/IMDb match was timed against
 * someone else's release, so a home rip may drift — say so rather than let the
 * user discover it halfway through the film.
 */
export function describeSubtitleDownload(
  data: SubtitleDownloadResponse,
): SubtitleNotice {
  const source = data.provider ? PROVIDER_LABELS[data.provider] : "provider";
  return data.hashMatch === false
    ? {
        text: `Downloaded from ${source} by title, not this exact file. Timing may be off.`,
        warn: true,
      }
    : { text: `Downloaded from ${source}, matched to this exact file.`, warn: false };
}

/**
 * Insert an uploaded track, or replace the one already occupying its path.
 *
 * The server writes to a deterministic path, so re-uploading overwrites the file
 * on disk — appending would list the same track twice. Replacement happens in
 * place because the list is rendered with index-based React keys, so moving an
 * entry to the end would remount the corresponding <track> element.
 */
export function upsertSubtitleTrack(
  list: SubtitleTrack[],
  track: SubtitleTrack,
): SubtitleTrack[] {
  return list.some((sub) => sub.path === track.path)
    ? list.map((sub) => (sub.path === track.path ? track : sub))
    : [...list, track];
}

export function getSubtitleContextKey({
  movieId,
  filePath,
  isPersistedMovie,
}: {
  movieId: number;
  filePath: string | null;
  isPersistedMovie: boolean;
}) {
  return `${movieId}:${isPersistedMovie ? "persisted" : "transient"}:${filePath ?? ""}`;
}

export function useMovieSubtitles({
  movieId,
  filePath,
  isPersistedMovie,
}: {
  movieId: number;
  filePath: string | null;
  isPersistedMovie: boolean;
}) {
  const [hasSubtitles, setHasSubtitles] = useState<boolean>(false);
  const [subtitlesList, setSubtitlesList] = useState<SubtitleTrack[]>([]);
  const [isSubtitleUploading, setIsSubtitleUploading] = useState(false);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [isDraggingSub, setIsDraggingSub] = useState(false);
  const [isSubtitleDownloading, setIsSubtitleDownloading] = useState(false);
  const [subtitleNotice, setSubtitleNotice] = useState<SubtitleNotice | null>(
    null,
  );
  const subtitleContextKey = getSubtitleContextKey({
    movieId,
    filePath,
    isPersistedMovie,
  });

  useEffect(() => {
    setSubtitleError(null);
    setSubtitleNotice(null);
  }, [subtitleContextKey]);

  useEffect(() => {
    if (!isPersistedMovie || !filePath) {
      setHasSubtitles(false);
      setSubtitlesList([]);
      return;
    }

    let isCurrent = true;

    async function loadSubtitles() {
      try {
        const response = await fetch(`/api/movies/${movieId}/subtitles`);
        const data = (await response.json()) as SubtitlesResponse;
        if (!isCurrent) return;

        setHasSubtitles(data.hasSubtitles);
        setSubtitlesList(data.subtitles || []);
      } catch (error) {
        console.error(error);
      }
    }

    loadSubtitles();

    return () => {
      isCurrent = false;
    };
  }, [movieId, filePath, isPersistedMovie]);

  const handleSubtitleUpload = async (file: File) => {
    console.log(
      `[Subtitles] Starting upload: ${file.name} (${file.size} bytes)`,
    );
    setIsSubtitleUploading(true);
    setSubtitleError(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      console.log(`[Subtitles] POST /api/movies/${movieId}/subtitles`);
      const response = await fetch(`/api/movies/${movieId}/subtitles`, {
        method: "POST",
        body: formData,
      });

      const text = await response.text();
      console.log("[Subtitles] Response received:", text.slice(0, 100));

      let data: SubtitleUploadResponse;
      try {
        data = JSON.parse(text) as SubtitleUploadResponse;
      } catch {
        console.error("[Subtitles] Failed to parse JSON:", text);
        throw new Error("Invalid server response");
      }

      if (data.ok && data.fileName && data.path) {
        const uploadedSubtitle = { name: data.fileName, path: data.path };
        console.log(`[Subtitles] Upload successful: ${uploadedSubtitle.name}`);
        setHasSubtitles(true);
        setSubtitlesList((prev) => upsertSubtitleTrack(prev, uploadedSubtitle));
      } else {
        console.warn(`[Subtitles] Upload failed: ${data.error}`);
        setSubtitleError(data.error || "Upload failed");
      }
    } catch (error) {
      console.error("[Subtitles] Network error:", error);
      setSubtitleError(
        `Network error: ${getErrorMessage(error) || "Check console"}`,
      );
    } finally {
      setIsSubtitleUploading(false);
    }
  };

  const handleSubtitleDownload = async () => {
    setIsSubtitleDownloading(true);
    setSubtitleError(null);
    setSubtitleNotice(null);
    try {
      // An explicit click with tracks already present means "try again".
      const query = hasSubtitles ? "?replace=1" : "";
      const response = await fetch(
        `/api/movies/${movieId}/subtitles/download${query}`,
        { method: "POST" },
      );
      const data = (await response.json()) as SubtitleDownloadResponse;
      if (data.ok && data.fileName && data.path) {
        const track = { name: data.fileName, path: data.path };
        setHasSubtitles(true);
        setSubtitlesList((prev) => upsertSubtitleTrack(prev, track));
        setSubtitleNotice(describeSubtitleDownload(data));
      } else {
        setSubtitleError(data.error || "Download failed");
      }
    } catch (error) {
      console.error("[Subtitles] Download error:", error);
      setSubtitleError(
        `Network error: ${getErrorMessage(error) || "Check console"}`,
      );
    } finally {
      setIsSubtitleDownloading(false);
    }
  };

  const onDragOverSub = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingSub(true);
  };

  const onDragLeaveSub = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingSub(false);
  };

  const onDropSub = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingSub(false);

    const file = event.dataTransfer.files?.[0];
    if (file) {
      console.log(`[Subtitles] File dropped: ${file.name}`);
      handleSubtitleUpload(file);
    }
  };

  return {
    hasSubtitles,
    subtitlesList,
    isSubtitleUploading,
    subtitleError,
    isDraggingSub,
    handleSubtitleUpload,
    isSubtitleDownloading,
    subtitleNotice,
    handleSubtitleDownload,
    onDragOverSub,
    onDragLeaveSub,
    onDropSub,
  };
}
