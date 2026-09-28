"use client";

import { useEffect, useRef, useState } from "react";
import type {
  MovieDetailMovie,
  StandardizeMessage,
} from "@/components/movie-detail/types";
import type { StandardizeJob } from "@/lib/types";

/** How often the detail asks how far a running standardize got. */
const STANDARDIZE_POLL_MS = 1000;

interface StandardizeResponse {
  ok?: boolean;
  message?: string;
  newPath?: string;
  newTitle?: string;
  mergedId?: number;
  error?: string;
  code?: string;
}

interface DeleteResponse {
  ok?: boolean;
  error?: string;
}

interface UseMovieFileActionsOptions {
  movie: MovieDetailMovie;
  onClose: () => void;
  onUpdate?: (updatedMovie: MovieDetailMovie) => void;
  onMerge?: (sourceId: number, targetId: number) => void;
  setFilePath: (filePath: string | null) => void;
  setMovieTitle: (movieTitle: string) => void;
}

async function parseStandardizeResponse(response: Response) {
  const text = await response.text();

  try {
    return JSON.parse(text) as StandardizeResponse;
  } catch {
    throw new Error(`Invalid server response: ${text.slice(0, 100)}`);
  }
}

export function useMovieFileActions({
  movie,
  onClose,
  onUpdate,
  onMerge,
  setFilePath,
  setMovieTitle,
}: UseMovieFileActionsOptions) {
  const [isStandardizing, setIsStandardizing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isDeletingDisk, setIsDeletingDisk] = useState(false);
  const [standardizeMsg, setStandardizeMsg] =
    useState<StandardizeMessage | null>(null);
  const [standardizeProgress, setStandardizeProgress] =
    useState<StandardizeJob | null>(null);
  // Bumped to (re)start polling the server's standardize state.
  const [standardizePoll, setStandardizePoll] = useState(0);
  // startedAt of the job whose outcome was already shown, so polling never
  // applies the same result twice.
  const appliedJobRef = useRef<number | null>(null);
  // True between clicking Standardize and the POST answering: a poll in that
  // window may still see the previous (finished) job and must not end polling.
  const postPendingRef = useRef(false);

  useEffect(() => {
    setStandardizeMsg(null);
    setIsRemoving(false);
    setIsDeletingDisk(false);
  }, [movie]);

  const applyStandardizeResult = (data: StandardizeResponse) => {
    if (data.ok) {
      setStandardizeMsg({
        type: "success",
        text: data.message || "Path standardized!",
      });
      // "Already standard" answers without newPath; the file did not move.
      if (data.newPath) setFilePath(data.newPath);
      if (data.newTitle) {
        setMovieTitle(data.newTitle);
      }
      if (onUpdate) {
        onUpdate({
          ...movie,
          file_path: data.newPath ?? movie.file_path,
          title: data.newTitle || movie.title,
        });
      }
      if (data.mergedId && onMerge) {
        // If merged during standardization, handle it seamlessly.
        onMerge(movie.id, data.mergedId);
      }
    } else {
      setStandardizeMsg({
        type: "error",
        text: data.error || "Failed to standardize",
        code: data.code,
      });
    }
  };
  // Polling outlives renders; always apply with the latest props.
  const applyResultRef = useRef(applyStandardizeResult);
  useEffect(() => {
    applyResultRef.current = applyStandardizeResult;
  });

  // A standardize keeps running on the server when this detail is closed. On
  // open, and after a click, poll its state: show the progress, keep the button
  // disabled while it runs, then show how it ended.
  useEffect(() => {
    setIsStandardizing(false);
    setStandardizeProgress(null);
    appliedJobRef.current = null;
  }, [movie.id]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/movies/${movie.id}/standardize`);
        const job = (await res.json()) as StandardizeJob | { status: "idle" };
        if (cancelled) return;
        if (job.status === "running") {
          setIsStandardizing(true);
          setStandardizeProgress(job);
          timer = setTimeout(poll, STANDARDIZE_POLL_MS);
          return;
        }
        if (postPendingRef.current) {
          timer = setTimeout(poll, STANDARDIZE_POLL_MS);
          return;
        }
        setIsStandardizing(false);
        setStandardizeProgress(null);
        if (
          job.status !== "idle" &&
          job.result &&
          appliedJobRef.current !== job.startedAt
        ) {
          appliedJobRef.current = job.startedAt;
          applyResultRef.current(job.result as StandardizeResponse);
        }
      } catch (error) {
        console.error("Standardize progress fetch error:", error);
        if (!cancelled) timer = setTimeout(poll, STANDARDIZE_POLL_MS * 3);
      }
    };
    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [movie.id, standardizePoll]);

  const handleStandardize = async () => {
    setIsStandardizing(true);
    setStandardizeMsg(null);
    setStandardizeProgress(null);
    postPendingRef.current = true;
    setStandardizePoll((n) => n + 1);

    // No client timeout: moving a file between shares copies every byte and
    // takes minutes for a large movie. The outcome is picked up by polling the
    // server's job, so a dropped connection loses nothing.
    try {
      const res = await fetch(`/api/movies/${movie.id}/standardize`, {
        method: "POST",
      });
      // Refused before a job started (rate limit, already running): the job
      // state has nothing new to say about this click.
      if (res.status === 409 || res.status === 429) {
        const data = await parseStandardizeResponse(res);
        setStandardizeMsg({
          type: "error",
          text: data.error || "Failed to standardize",
        });
      }
    } catch (error) {
      console.error("Standardization fetch error:", error);
    } finally {
      postPendingRef.current = false;
      setStandardizePoll((n) => n + 1);
    }
  };

  const handleRemoveMissing = async () => {
    if (
      !confirm(
        "Are you sure you want to remove this entry? The file is missing or unmounted.",
      )
    )
      return;
    setIsRemoving(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const res = await fetch(
        `/api/movies/${movie.id}/standardize?delete_missing=true`,
        {
          method: "POST",
          signal: controller.signal,
        },
      );

      const data = await parseStandardizeResponse(res);

      if (data.ok) {
        onClose();
        if (onMerge) {
          // Removing a missing file record updates the list like a merge removal.
          onMerge(movie.id, -1);
        }
      } else {
        setStandardizeMsg({
          type: "error",
          text: data.error || "Failed to remove",
        });
      }
    } catch (error) {
      console.error("Remove missing fetch error:", error);
      setStandardizeMsg({ type: "error", text: "Network error" });
    } finally {
      clearTimeout(timeoutId);
      setIsRemoving(false);
    }
  };

  const handleDeleteFull = async () => {
    const confirmation = confirm(
      `\u26a0\ufe0f DANGER: Are you sure you want to delete "${movie.title}" from BOTH the database and YOUR DISK?\n\nThis will permanently delete the entire movie folder and all its contents.`,
    );
    if (!confirmation) return;

    setIsDeletingDisk(true);
    try {
      const res = await fetch(`/api/movies/${movie.id}/full`, {
        method: "DELETE",
      });
      const data = (await res.json()) as DeleteResponse;

      if (data.ok) {
        onClose();
        if (onMerge) {
          // Signal removal from list.
          onMerge(movie.id, -1);
        }
      } else {
        alert(data.error || "Failed to delete from disk");
      }
    } catch (error) {
      console.error("Delete full error:", error);
      alert("Network error while deleting");
    } finally {
      setIsDeletingDisk(false);
    }
  };

  const handleDeleteDiskOnly = async () => {
    const confirmation = confirm(
      `Delete "${movie.title}" folder from disk?\n\nYour rating and metadata will be kept in the database.`,
    );
    if (!confirmation) return;

    setIsDeletingDisk(true);
    try {
      const res = await fetch(`/api/movies/${movie.id}/full?disk_only=1`, {
        method: "DELETE",
      });
      const data = (await res.json()) as DeleteResponse;

      if (data.ok) {
        setFilePath(null);
        if (onUpdate) {
          onUpdate({
            ...movie,
            file_path: null,
            extra_files: null,
            video_metadata: null,
          });
        }
      } else {
        alert(data.error || "Failed to delete from disk");
      }
    } catch (error) {
      console.error("Delete disk-only error:", error);
      alert("Network error while deleting");
    } finally {
      setIsDeletingDisk(false);
    }
  };

  return {
    isStandardizing,
    standardizeProgress,
    isRemoving,
    isDeletingDisk,
    standardizeMsg,
    handleStandardize,
    handleRemoveMissing,
    handleDeleteFull,
    handleDeleteDiskOnly,
  };
}
