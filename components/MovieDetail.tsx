"use client";

import { useState, useEffect, useMemo } from "react";
import path from "path";
import { cleanTitle, getErrorMessage } from "@/lib/utils";

interface VideoAudioTrack {
  codec: string;
  channels: number;
  language?: string;
}

interface VideoMetadata {
  error?: string;
  size?: number;
  bitrate?: number;
  video?: {
    width?: number;
    height?: number;
    codec?: string;
  };
  audio?: VideoAudioTrack[];
}

interface Movie {
  id: number;
  title: string;
  year: number | null;
  genre: string | null;
  director: string | null;
  writer: string | null;
  actors: string | null;
  rating: number | null;
  user_rating: number | null;
  poster_url: string | null;
  source: string | null;
  type: string;
  tmdb_id?: number | null;
  filmweb_url?: string | null;
  cda_url?: string | null;
  pl_title?: string | null;
  description?: string | null;
  rated_at: string | null;
  created_at: string;
  file_path?: string | null;
  extra_files?: string | null;
  video_metadata?: string | null;
}

interface MovieDetailProps {
  movie: Movie;
  onClose: () => void;
  onUpdate?: (updatedMovie: Movie) => void;
  onMerge?: (sourceId: number, targetId: number) => void;
  onSearchTMDb?: (query: string, targetMovieId?: number) => void;
  onPersonClick?: (name: string) => void;
  allMovies?: Movie[];
}

export default function MovieDetail({
  movie,
  onClose,
  onUpdate,
  onMerge,
  onSearchTMDb,
  onPersonClick,
  allMovies,
}: MovieDetailProps) {
  const [libraryRoot, setLibraryRoot] = useState<string | null>(null);
  const [plTitle, setPlTitle] = useState<string | null>(movie.pl_title || null);
  const [description, setDescription] = useState<string | null>(
    movie.description || null,
  );
  const [director, setDirector] = useState<string | null>(
    movie.director || null,
  );
  const [writer, setWriter] = useState<string | null>(movie.writer || null);
  const [actors, setActors] = useState<string | null>(movie.actors || null);
  const [filePath, setFilePath] = useState<string | null>(
    movie.file_path || null,
  );
  const [movieTitle, setMovieTitle] = useState<string>(movie.title);
  const [posterUrl, setPosterUrl] = useState<string | null>(movie.poster_url || null);
  const [isStandardizing, setIsStandardizing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isDeletingDisk, setIsDeletingDisk] = useState(false);
  const [standardizeMsg, setStandardizeMsg] = useState<{
    type: "success" | "error";
    text: string;
    code?: string;
  } | null>(null);
  const [mergeQuery, setMergeQuery] = useState("");
  const [isMergeMode, setIsMergeMode] = useState(false);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [isRating, setIsRating] = useState(false);
  const [showRatingPicker, setShowRatingPicker] = useState(false);
  const [userRating, setUserRating] = useState<number | null>(
    movie.user_rating || null,
  );
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showEmbedded, setShowEmbedded] = useState(false);
  const [activePart, setActivePart] = useState(0);
  const [playError, setPlayError] = useState<string | null>(null);

  // Subtitle state
  const [hasSubtitles, setHasSubtitles] = useState<boolean>(false);
  const [subtitlesList, setSubtitlesList] = useState<
    { name: string; path: string }[]
  >([]);
  const [isSubtitleUploading, setIsSubtitleUploading] = useState(false);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [isDraggingSub, setIsDraggingSub] = useState(false);
  const [personRatings, setPersonRatings] = useState<
    Record<string, { avg_rating: number; movie_count: number }>
  >({});

  // Sync state if movie prop changes
  useEffect(() => {
    setMovieTitle(movie.title);
    setPosterUrl(movie.poster_url || null);
    setFilePath(movie.file_path || null);
    setPlTitle(movie.pl_title || null);
    setDescription(movie.description || null);
    setDirector(movie.director || null);
    setWriter(movie.writer || null);
    setActors(movie.actors || null);
    setStandardizeMsg(null);
    setIsMergeMode(false);
    setMergeQuery("");
    setSubtitleError(null);
    setVideoMetadata(null);
    setUserRating(movie.user_rating || null);
    setIsMenuOpen(false);
    setShowEmbedded(false);
    setActivePart(0);
    setPlayError(null);
    setPersonRatings({});

    // Fetch person ratings for all credits (single batch request)
    const allPeople = [
      ...(movie.director || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      ...(movie.writer || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      ...(movie.actors || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ];
    const uniquePeople = [...new Set(allPeople)];
    if (uniquePeople.length > 0) {
      const params = new URLSearchParams();
      uniquePeople.forEach((n) => params.append("names", n));
      fetch(`/api/person-ratings?${params}`)
        .then((r) => r.json())
        .then(
          (
            results: {
              name: string;
              avg_rating: number;
              movie_count: number;
            }[],
          ) => {
            const map: Record<
              string,
              { avg_rating: number; movie_count: number }
            > = {};
            for (const r of results) {
              if (r.movie_count >= 1) {
                if (!map[r.name] || r.movie_count > map[r.name].movie_count) {
                  map[r.name] = {
                    avg_rating: r.avg_rating,
                    movie_count: r.movie_count,
                  };
                }
              }
            }
            setPersonRatings(map);
          },
        )
        .catch(() => {});
    }

    // Fetch full movie details including metadata
    setIsLoadingMetadata(true);
    fetch(`/api/movies/${movie.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.metadata) {
          if (data.metadata.error) {
            setVideoMetadata({ error: data.metadata.error });
          } else {
            setVideoMetadata(data.metadata);
          }
        }
        if (data.movie) {
          if (data.movie.pl_title) setPlTitle(data.movie.pl_title);
          if (data.movie.description) setDescription(data.movie.description);
          if (data.movie.director) setDirector(data.movie.director);
          if (data.movie.writer) setWriter(data.movie.writer);
          if (data.movie.actors) setActors(data.movie.actors);
          if (data.movie.poster_url) setPosterUrl(data.movie.poster_url);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoadingMetadata(false));
  }, [movie]);

  useEffect(() => {
    if (movie.id && filePath) {
      fetch(`/api/movies/${movie.id}/subtitles`)
        .then((r) => r.json())
        .then((data) => {
          setHasSubtitles(data.hasSubtitles);
          setSubtitlesList(data.subtitles || []);
        })
        .catch(console.error);
    } else {
      setHasSubtitles(false);
      setSubtitlesList([]);
    }
  }, [movie.id, filePath]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.library_path) setLibraryRoot(data.library_path);
      })
      .catch(console.error);
  }, []);

  const handleMerge = async (targetId: number) => {
    if (
      !confirm(
        "Are you sure you want to merge these movies? This one will be deleted and its data moved to the target.",
      )
    )
      return;
    setIsMerging(true);
    try {
      const res = await fetch("/api/movies/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: movie.id, targetId }),
      });
      const data = await res.json();
      if (data.ok) {
        if (onMerge) onMerge(movie.id, targetId);
      } else {
        alert(data.error || "Merge failed");
      }
    } catch (e) {
      console.error(e);
      alert("Merge failed");
    } finally {
      setIsMerging(false);
    }
  };

  const handleSubtitleUpload = async (file: File) => {
    console.log(
      `[Subtitles] Starting upload: ${file.name} (${file.size} bytes)`,
    );
    setIsSubtitleUploading(true);
    setSubtitleError(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      console.log(`[Subtitles] POST /api/movies/${movie.id}/subtitles`);
      const res = await fetch(`/api/movies/${movie.id}/subtitles`, {
        method: "POST",
        body: formData,
      });

      const text = await res.text();
      console.log(`[Subtitles] Response received:`, text.slice(0, 100));

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error(`[Subtitles] Failed to parse JSON:`, text);
        throw new Error("Invalid server response");
      }

      if (data.ok) {
        console.log(`[Subtitles] Upload successful: ${data.fileName}`);
        setHasSubtitles(true);
        setSubtitlesList((prev) => [
          ...prev,
          { name: data.fileName, path: data.path },
        ]);
      } else {
        console.warn(`[Subtitles] Upload failed: ${data.error}`);
        setSubtitleError(data.error || "Upload failed");
      }
    } catch (e) {
      console.error(`[Subtitles] Network error:`, e);
      setSubtitleError(`Network error: ${getErrorMessage(e) || "Check console"}`);
    } finally {
      setIsSubtitleUploading(false);
    }
  };

  const onDragOverSub = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingSub(true);
  };

  const onDragLeaveSub = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingSub(false);
  };

  const onDropSub = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingSub(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      console.log(`[Subtitles] File dropped: ${file.name}`);
      handleSubtitleUpload(file);
    }
  };

  const potentialMerges = useMemo(() => {
    const cleanCurrentTitle = cleanTitle(movieTitle).toLowerCase();
    const cleanCurrentPlTitle = plTitle
      ? cleanTitle(plTitle).toLowerCase()
      : "";

    return (allMovies || [])
      .filter((m) => m.id !== movie.id)
      .map((m) => {
        const cleanMTitle = cleanTitle(m.title).toLowerCase();
        const cleanMPlTitle = m.pl_title
          ? cleanTitle(m.pl_title).toLowerCase()
          : "";

        let score = 0;
        if (mergeQuery) {
          if (m.title.toLowerCase().includes(mergeQuery.toLowerCase()))
            score += 10;
          if (m.pl_title?.toLowerCase().includes(mergeQuery.toLowerCase()))
            score += 10;
        } else {
          // Auto-match score
          if (cleanMTitle === cleanCurrentTitle) score += 20;
          if (cleanMPlTitle && cleanMPlTitle === cleanCurrentPlTitle)
            score += 20;
          if (cleanMPlTitle && cleanMPlTitle === cleanCurrentTitle) score += 15;
          if (cleanMTitle === cleanCurrentPlTitle) score += 15;
          if (movie.year && m.year === movie.year) score += 5;
        }
        return { movie: m, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.movie)
      .slice(0, 10);
  }, [allMovies, movie.id, movie.year, movieTitle, plTitle, mergeQuery]);

  const hasMatches = useMemo(() => {
    const cleanCurrentTitle = cleanTitle(movieTitle).toLowerCase();
    const cleanCurrentPlTitle = plTitle
      ? cleanTitle(plTitle).toLowerCase()
      : "";

    return (allMovies || []).some((m) => {
      if (m.id === movie.id) return false;

      const cleanMTitle = cleanTitle(m.title).toLowerCase();
      const cleanMPlTitle = m.pl_title
        ? cleanTitle(m.pl_title).toLowerCase()
        : "";

      return (
        cleanMTitle === cleanCurrentTitle ||
        (cleanMPlTitle && cleanMPlTitle === cleanCurrentPlTitle) ||
        (cleanMPlTitle && cleanMPlTitle === cleanCurrentTitle) ||
        cleanMTitle === cleanCurrentPlTitle
      );
    });
  }, [allMovies, movie.id, movieTitle, plTitle]);

  const handlePlay = async (action: "play" | "folder" = "play") => {
    setPlayError(null);
    if (action === "play") setIsPlaying(true);
    try {
      const res = await fetch(`/api/movies/${movie.id}/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!data.ok) {
        setPlayError(data.error || `Failed to ${action}`);
      }
    } catch (e) {
      setPlayError(`Network error while trying to ${action}`);
    } finally {
      setIsPlaying(false);
    }
  };

  const handleRate = async (rating: number) => {
    setIsRating(true);
    try {
      const res = await fetch(`/api/movies/${movie.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_rating: rating, wishlist: 0 }),
      });

      if (res.ok) {
        const updated = await res.json();
        setUserRating(rating);
        setShowRatingPicker(false);
        if (onUpdate) onUpdate(updated);
      }
    } catch (e) {
      console.error("Failed to rate movie:", e);
    } finally {
      setIsRating(false);
    }
  };

  const handleStandardize = async () => {
    setIsStandardizing(true);
    setStandardizeMsg(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

    try {
      const res = await fetch(`/api/movies/${movie.id}/standardize`, {
        method: "POST",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      let data;
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`Invalid server response: ${text.slice(0, 100)}`);
      }

      if (data.ok) {
        setStandardizeMsg({
          type: "success",
          text: data.message || "Path standardized!",
        });
        setFilePath(data.newPath);
        if (data.newTitle) {
          setMovieTitle(data.newTitle);
        }
        if (onUpdate) {
          onUpdate({
            ...movie,
            file_path: data.newPath,
            title: data.newTitle || movie.title,
          });
        }
        if (data.mergedId && onMerge) {
          // If merged during standardization, handle it seamlessly
          onMerge(movie.id, data.mergedId);
        }
      } else {
        setStandardizeMsg({
          type: "error",
          text: data.error || "Failed to standardize",
          code: data.code,
        });
      }
    } catch (e) {
      console.error("Standardization fetch error:", e);
      setStandardizeMsg({
        type: "error",
        text:
          e instanceof Error && e.name === "AbortError"
            ? "Request timed out"
            : "Network error (check server logs)",
      });
    } finally {
      setIsStandardizing(false);
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
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

    try {
      const res = await fetch(
        `/api/movies/${movie.id}/standardize?delete_missing=true`,
        {
          method: "POST",
          signal: controller.signal,
        },
      );
      clearTimeout(timeoutId);

      let data;
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`Invalid server response: ${text.slice(0, 100)}`);
      }

      if (data.ok) {
        onClose();
        if (onMerge) {
          // Effectively removing a missing file record is like merging into nothing or
          // just removing it from the list.
          onMerge(movie.id, -1);
        }
      } else {
        setStandardizeMsg({
          type: "error",
          text: data.error || "Failed to remove",
        });
      }
    } catch (e) {
      console.error("Remove missing fetch error:", e);
      setStandardizeMsg({ type: "error", text: "Network error" });
    } finally {
      setIsRemoving(false);
    }
  };

  const handleDeleteFull = async () => {
    const confirmation = confirm(
      `⚠️ DANGER: Are you sure you want to delete "${movie.title}" from BOTH the database and YOUR DISK?\n\nThis will permanently delete the entire movie folder and all its contents.`,
    );
    if (!confirmation) return;

    setIsDeletingDisk(true);
    try {
      const res = await fetch(`/api/movies/${movie.id}/full`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.ok) {
        onClose();
        if (onMerge) {
          // Signal removal from list
          onMerge(movie.id, -1);
        }
      } else {
        alert(data.error || "Failed to delete from disk");
      }
    } catch (e) {
      console.error("Delete full error:", e);
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
      const data = await res.json();

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
    } catch (e) {
      console.error("Delete disk-only error:", e);
      alert("Network error while deleting");
    } finally {
      setIsDeletingDisk(false);
    }
  };

  useEffect(() => {
    if ((!plTitle || !description) && movie.tmdb_id) {
      fetch(`/api/pl-title?tmdb_id=${movie.tmdb_id}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.pl_title && !plTitle) setPlTitle(d.pl_title);
          if (d.description && !description) setDescription(d.description);
        })
        .catch(() => {});
    }
  }, [movie.tmdb_id, plTitle, description]);
  const safeTitle = movieTitle.replace(/[\\/:*?"<>|]/g, " ");

  // Standard format: Title [Year]/Title.ext
  const isStandard =
    filePath &&
    movie.year &&
    libraryRoot &&
    filePath ===
      path.join(
        libraryRoot,
        `${safeTitle} [${movie.year}]`,
        `${safeTitle}${path.extname(filePath)}`,
      );

  // Also check for standard format WITHOUT year in folder if movie.year is missing: Title/Title.ext
  const isStandardNoYear =
    filePath &&
    !movie.year &&
    libraryRoot &&
    filePath ===
      path.join(
        libraryRoot,
        safeTitle,
        `${safeTitle}${path.extname(filePath)}`,
      );

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700/50 rounded-2xl w-full max-w-5xl max-h-[90vh] shadow-2xl relative flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-end gap-2 px-4 sm:px-6 pt-3 pb-2">
          {filePath && (
            <div className="flex items-center gap-2 mr-2">
              <button
                onClick={() => handlePlay("play")}
                disabled={isPlaying}
                className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 group h-10"
                title="Play Movie"
              >
                <span className="text-base group-hover:scale-110 transition-transform">
                  {isPlaying ? "⏳" : "▶️"}
                </span>
                <span className="text-xs uppercase tracking-wider hidden sm:inline">
                  Play
                </span>
              </button>
              <button
                onClick={() => handlePlay("folder")}
                className="flex items-center justify-center w-10 h-10 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-xl transition-all border border-gray-700/50 group"
                title="Open in Finder"
              >
                <span className="text-lg group-hover:scale-110 transition-transform">
                  📂
                </span>
              </button>
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen(!isMenuOpen);
            }}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              isMenuOpen
                ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                : "bg-gray-800/80 text-gray-500 hover:text-white hover:bg-gray-800"
            }`}
            title="Management Menu"
          >
            <span className="text-xl">⋮</span>
          </button>
          <button
            onClick={onClose}
            className="w-10 h-10 bg-gray-800/80 hover:bg-gray-800 text-gray-500 hover:text-white rounded-xl flex items-center justify-center transition-all text-xl"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Menu Dropdown */}
        {isMenuOpen && (
          <div
            className="absolute top-16 right-6 z-[60] w-64 bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 space-y-1">
              {onSearchTMDb && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onSearchTMDb(movie.title, movie.id);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-indigo-500/10 rounded-xl transition-colors flex items-center gap-3 group"
                >
                  <span className="text-base group-hover:scale-110 transition-transform">
                    🔄
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                      Fix Metadata
                    </span>
                    <span className="text-[9px] text-indigo-500/60 font-bold uppercase tracking-tight">
                      Search TMDb for correct match
                    </span>
                  </div>
                </button>
              )}

              {!isMergeMode && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsMergeMode(true);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-indigo-500/10 rounded-xl transition-colors flex items-center gap-3 group"
                >
                  <span className="text-base group-hover:scale-110 transition-transform">
                    🔗
                  </span>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                        Merge Duplicates
                      </span>
                      {hasMatches && (
                        <span className="flex h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                      )}
                    </div>
                    <span className="text-[9px] text-indigo-500/60 font-bold uppercase tracking-tight">
                      Combine two entries into one
                    </span>
                  </div>
                </button>
              )}

              {standardizeMsg?.code === "FILE_NOT_FOUND" && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    handleRemoveMissing();
                  }}
                  disabled={isRemoving}
                  className="w-full text-left px-4 py-3 hover:bg-red-500/10 rounded-xl transition-colors flex items-center gap-3 group"
                >
                  <span className="text-base group-hover:scale-110 transition-transform">
                    🗑️
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                      Remove Missing Entry
                    </span>
                    <span className="text-[9px] text-red-500/60 font-bold uppercase tracking-tight">
                      File not found, clean up library
                    </span>
                  </div>
                </button>
              )}

              {filePath && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    handleDeleteDiskOnly();
                  }}
                  disabled={isDeletingDisk}
                  className="w-full text-left px-4 py-3 hover:bg-orange-500/10 rounded-xl transition-colors flex items-center gap-3 group"
                >
                  <span className="text-base group-hover:scale-110 transition-transform">
                    📂
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">
                      Delete Files
                    </span>
                    <span className="text-[9px] text-orange-500/60 font-bold uppercase tracking-tight">
                      Remove from disk, keep in library
                    </span>
                  </div>
                </button>
              )}

              {filePath && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    handleDeleteFull();
                  }}
                  disabled={isDeletingDisk}
                  className="w-full text-left px-4 py-3 hover:bg-red-500/10 rounded-xl transition-colors flex items-center gap-3 group"
                >
                  <span className="text-base group-hover:scale-110 transition-transform">
                    🔥
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                      Remove from Library
                    </span>
                    <span className="text-[9px] text-red-500/60 font-bold uppercase tracking-tight">
                      Delete files and library entry
                    </span>
                  </div>
                </button>
              )}
            </div>
          </div>
        )}

        <div className="overflow-y-auto flex-1 px-4 sm:px-8 pb-6 pt-2">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Poster, Credits & Technical Info */}
          <div className="lg:col-span-4 space-y-6">
            <div className="flex-shrink-0 relative group">
              {posterUrl ? (
                <div className="relative aspect-[2/3]">
                  <img
                    src={posterUrl}
                    alt={movie.title}
                    className="w-full h-full object-cover rounded-2xl shadow-2xl border border-gray-700/30"
                    onError={(e) => {
                      // If TMDB image fails, try a fallback or just show the placeholder
                      (e.target as HTMLImageElement).style.display = "none";
                      (
                        e.target as HTMLImageElement
                      ).parentElement?.classList.add(
                        "flex",
                        "items-center",
                        "justify-center",
                        "bg-gray-800",
                      );
                      const span = document.createElement("span");
                      span.className = "text-6xl opacity-30";
                      span.innerText = "🎬";
                      (e.target as HTMLImageElement).parentElement?.appendChild(
                        span,
                      );
                    }}
                  />
                </div>
              ) : (
                <div className="w-full aspect-[2/3] bg-gray-800 rounded-2xl flex items-center justify-center border border-gray-700/30">
                  <span className="text-6xl opacity-30">🎬</span>
                </div>
              )}

              {filePath && !showEmbedded && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded-2xl backdrop-blur-[2px]">
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => handlePlay("play")}
                      disabled={isPlaying}
                      className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 flex items-center gap-3 transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
                    >
                      <span className="text-xl">{isPlaying ? "⏳" : "▶️"}</span>
                      {isPlaying ? "Opening..." : "Play in VLC"}
                    </button>
                    <button
                      onClick={() => setShowEmbedded(true)}
                      className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest backdrop-blur-md border border-white/10 flex items-center gap-3 transition-transform hover:scale-105 active:scale-95"
                    >
                      <span className="text-xl">📺</span>
                      Embed Player
                    </button>
                  </div>
                </div>
              )}
            </div>

            {playError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-[10px] font-bold uppercase tracking-wider text-center animate-in fade-in slide-in-from-top-2">
                ⚠️ {playError}
              </div>
            )}

            {/* Credits Info */}
            <div className="bg-gray-800/40 rounded-2xl p-5 border border-gray-700/30 space-y-4">
              {director && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                    Director
                  </p>
                  <div className="flex flex-col gap-1">
                    {director.split(",").map((d, i) => {
                      const name = d.trim();
                      const pr = personRatings[name];
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <button
                            onClick={() => onPersonClick?.(name)}
                            className="text-white text-sm font-medium hover:text-indigo-400 transition-colors text-left"
                          >
                            {name}
                          </button>
                          {pr && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-400">
                              {pr.avg_rating}/10 ({pr.movie_count})
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {writer && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                    Scenario
                  </p>
                  <div className="flex flex-col gap-1">
                    {writer.split(",").map((w, i) => {
                      const name = w.trim();
                      const pr = personRatings[name];
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <button
                            onClick={() => onPersonClick?.(name)}
                            className="text-white text-sm font-medium hover:text-indigo-400 transition-colors text-left"
                          >
                            {name}
                          </button>
                          {pr && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-400">
                              {pr.avg_rating}/10 ({pr.movie_count})
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {actors && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                    Actors
                  </p>
                  <div className="flex flex-col gap-1">
                    {actors.split(",").map((actor, i) => {
                      const name = actor.trim();
                      const pr = personRatings[name];
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <button
                            onClick={() => onPersonClick?.(name)}
                            className="text-white text-sm font-medium hover:text-indigo-400 transition-colors text-left"
                          >
                            {name}
                          </button>
                          {pr && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-400">
                              {pr.avg_rating}/10 ({pr.movie_count})
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {!director && !writer && !actors && isLoadingMetadata && (
                <div className="animate-pulse space-y-4">
                  <div className="h-3 bg-gray-700 rounded w-1/2"></div>
                  <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                </div>
              )}
            </div>

            {/* Technical Metadata */}
            {(videoMetadata || isLoadingMetadata) && (
              <div className="bg-gray-800/40 rounded-2xl p-5 border border-gray-700/30 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-400">
                    Technical Details
                  </h3>
                  {isLoadingMetadata && (
                    <span className="animate-pulse text-[10px] text-gray-500 font-bold uppercase">
                      Loading...
                    </span>
                  )}
                </div>

                {videoMetadata?.error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                    <p className="text-red-400 text-xs">
                      {videoMetadata.error}
                    </p>
                  </div>
                )}

                {videoMetadata && !videoMetadata.error && (
                  <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                    <div className="space-y-1">
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">
                        Resolution
                      </p>
                      <div className="text-sm text-gray-200 font-medium flex items-center gap-1.5 flex-wrap">
                        {videoMetadata.video?.width} ×{" "}
                        {videoMetadata.video?.height}
                        {(videoMetadata.video?.width ?? 0) >= 3840 ? (
                          <span className="px-1 py-0.5 bg-yellow-500/10 text-yellow-500 text-[9px] font-black rounded border border-yellow-500/20">
                            4K
                          </span>
                        ) : (videoMetadata.video?.width ?? 0) >= 1920 ? (
                          <span className="px-1 py-0.5 bg-blue-500/10 text-blue-500 text-[9px] font-black rounded border border-blue-500/20">
                            FHD
                          </span>
                        ) : (videoMetadata.video?.width ?? 0) >= 1280 ? (
                          <span className="px-1 py-0.5 bg-green-500/10 text-green-400 text-[9px] font-black rounded border border-green-500/20">
                            HD
                          </span>
                        ) : (
                          <span className="px-1 py-0.5 bg-gray-500/10 text-gray-400 text-[9px] font-black rounded border border-gray-500/20 uppercase">
                            SD
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">
                        Video Codec
                      </p>
                      <p className="text-sm text-gray-200 font-medium uppercase">
                        {videoMetadata.video?.codec}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">
                        File Size
                      </p>
                      <p className="text-sm text-gray-200 font-medium">
                        {((videoMetadata.size ?? 0) / (1024 * 1024 * 1024)).toFixed(2)}{" "}
                        GB
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">
                        Bitrate
                      </p>
                      <p className="text-sm text-gray-200 font-medium">
                        {((videoMetadata.bitrate ?? 0) / 1000).toFixed(0)} kbps
                      </p>
                    </div>

                    {videoMetadata.audio && videoMetadata.audio.length > 0 && (
                      <div className="col-span-2 space-y-2 pt-2 border-t border-gray-700/30">
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">
                          Audio Tracks
                        </p>
                        <div className="space-y-2">
                          {videoMetadata.audio.map(
                            (audio: VideoAudioTrack, idx: number) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between bg-gray-900/40 px-2.5 py-1.5 rounded-lg border border-gray-700/20"
                              >
                                <span className="text-xs text-gray-300 font-medium uppercase">
                                  {audio.codec}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-gray-500 font-bold">
                                    {audio.channels} ch
                                  </span>
                                  {audio.language && (
                                    <span className="px-1 py-0.5 bg-indigo-500/10 text-indigo-400 text-[9px] font-black rounded border border-indigo-500/20 uppercase">
                                      {audio.language}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-8 space-y-8">
            {/* Title & Actions */}
            <div className="space-y-1">
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {movieTitle}
              </h2>
              {plTitle && plTitle !== movieTitle && (
                <p className="text-xl text-gray-400 font-medium">{plTitle}</p>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {movie.year && (
                <span className="px-2 py-1 bg-white/5 text-gray-300 text-sm font-bold rounded-lg border border-white/10">
                  {movie.year}
                </span>
              )}
              {movie.source && (
                <span className="text-[10px] font-black px-2.5 py-1 bg-indigo-500/10 text-indigo-400 rounded-lg uppercase tracking-widest border border-indigo-500/20">
                  {movie.source === "tmdb"
                    ? "TMDb"
                    : movie.source.toUpperCase()}
                </span>
              )}
              {filePath && (
                <span className="text-[10px] font-black px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg uppercase tracking-widest border border-emerald-500/20 flex items-center gap-1">
                  <span className="text-[12px]">📂</span> FILE
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                {/* Ratings */}
                <div className="flex items-center gap-6">
                  <div className="space-y-1.5">
                      <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                        My Rating
                      </p>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setShowRatingPicker((v) => !v)}
                          title="Click to change rating"
                          className="bg-indigo-500 text-white font-black text-2xl px-3 py-1 rounded-xl shadow-lg shadow-indigo-500/20 flex items-center gap-2 hover:bg-indigo-400 transition-colors cursor-pointer"
                        >
                          ♥ {userRating != null && userRating > 0 ? userRating : "—"}
                        </button>
                      </div>
                      {showRatingPicker && (
                        <div className="flex flex-col gap-1 mt-2">
                          <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                              <button
                                key={i}
                                onClick={() => handleRate(i + 1)}
                                disabled={isRating}
                                title={`Rate ${i + 1}/10`}
                                className={`w-9 h-9 rounded-md text-[11px] font-black transition-all border ${
                                  isRating
                                    ? "opacity-50 cursor-not-allowed"
                                    : "hover:scale-110 active:scale-95"
                                } ${
                                  userRating === i + 1
                                    ? "bg-indigo-500 border-indigo-400 text-white"
                                    : "bg-gray-800 border-gray-700 text-gray-400 hover:border-indigo-500 hover:text-indigo-400"
                                }`}
                              >
                                {i + 1}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => {
                              const rating = i + 6;
                              return (
                                <button
                                  key={rating}
                                  onClick={() => handleRate(rating)}
                                  disabled={isRating}
                                  title={`Rate ${rating}/10`}
                                  className={`w-9 h-9 rounded-md text-[11px] font-black transition-all border ${
                                    isRating
                                      ? "opacity-50 cursor-not-allowed"
                                      : "hover:scale-110 active:scale-95"
                                  } ${
                                    userRating === rating
                                      ? "bg-indigo-500 border-indigo-400 text-white"
                                      : "bg-gray-800 border-gray-700 text-gray-400 hover:border-indigo-500 hover:text-indigo-400"
                                  }`}
                                >
                                  {rating}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  {/* Global Rating Badge */}
                  {movie.rating != null && movie.rating > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                        Global
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="bg-yellow-500 text-black font-black text-2xl px-3 py-1 rounded-xl shadow-lg shadow-yellow-500/20">
                          ★ {movie.rating}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Genre */}
                <div className="space-y-4">
                  {movie.genre && (
                    <div className="space-y-2">
                      <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                        Genres
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {movie.genre.split(", ").map((g) => (
                          <span
                            key={g}
                            className="text-xs px-3 py-1 bg-gray-800 text-gray-300 rounded-lg border border-gray-700/50"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                {/* Merge Input (Active State) */}
                {isMergeMode && (
                  <div className="bg-gray-800 p-4 rounded-2xl border border-indigo-500/30 animate-in fade-in zoom-in-95 duration-200 shadow-xl">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">
                        Merge target:
                      </span>
                      <button
                        onClick={() => setIsMergeMode(false)}
                        className="text-gray-500 hover:text-white text-[10px] font-bold uppercase tracking-wider"
                      >
                        cancel
                      </button>
                    </div>
                    <input
                      autoFocus
                      type="text"
                      value={mergeQuery}
                      onChange={(e) => setMergeQuery(e.target.value)}
                      placeholder="Search movie..."
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 mb-3"
                    />
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                      {potentialMerges.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => handleMerge(m.id)}
                          disabled={isMerging}
                          className="w-full text-left px-3 py-2 hover:bg-indigo-500/10 rounded-xl text-xs text-gray-300 hover:text-white flex items-center justify-between group transition-colors"
                        >
                          <span className="truncate">
                            {m.title}{" "}
                            <span className="text-gray-500 font-bold ml-1">
                              [{m.year}]
                            </span>
                          </span>
                          <span className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-indigo-400 font-black uppercase text-[9px] ml-2 tracking-tighter">
                            Merge →
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* External Links */}
                <div className="space-y-3 pt-2">
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                    Quick Links
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {movie.tmdb_id && (
                      <a
                        href={`https://www.themoviedb.org/movie/${movie.tmdb_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-gray-800/50 hover:bg-gray-800 border border-gray-700/30 hover:border-blue-500/30 px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-blue-400 transition-all text-center"
                      >
                        TMDb
                      </a>
                    )}
                    {movie.filmweb_url && (
                      <a
                        href={movie.filmweb_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-gray-800/50 hover:bg-gray-800 border border-gray-700/30 hover:border-indigo-500/30 px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-indigo-400 transition-all text-center"
                      >
                        Filmweb
                      </a>
                    )}
                    <a
                      href={
                        movie.cda_url ||
                        `https://www.cda.pl/szukaj?q=${encodeURIComponent(plTitle || movie.title)}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-gray-800/50 hover:bg-gray-800 border border-gray-700/30 hover:border-indigo-500/30 px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-indigo-400 transition-all text-center"
                    >
                      CDA.pl
                    </a>
                    <a
                      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(movie.title + (movie.year ? ` ${movie.year}` : "") + " trailer")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-gray-800/50 hover:bg-gray-800 border border-gray-700/30 hover:border-red-500/30 px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-red-400 transition-all text-center"
                    >
                      Trailer
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Description or Embedded Player */}
            {showEmbedded && filePath ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">
                      Embedded Player
                    </p>
                    {movie.extra_files && (
                      <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
                        {[filePath, ...JSON.parse(movie.extra_files)].map(
                          (_, i) => (
                            <button
                              key={i}
                              onClick={() => setActivePart(i)}
                              className={`px-2 py-0.5 text-[9px] font-bold rounded ${
                                activePart === i
                                  ? "bg-indigo-500 text-white"
                                  : "text-gray-500 hover:text-gray-300"
                              }`}
                            >
                              Part {i + 1}
                            </button>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowEmbedded(false)}
                    className="text-[10px] text-gray-500 hover:text-white font-black uppercase tracking-widest"
                  >
                    Close Player ×
                  </button>
                </div>
                <div className="bg-black rounded-2xl overflow-hidden aspect-video border border-gray-800 shadow-2xl relative group">
                  <video
                    key={`${movie.id}-${activePart}`}
                    controls
                    className="w-full h-full"
                    poster={posterUrl || undefined}
                    autoPlay
                  >
                    <source
                      src={`/api/movies/${movie.id}/stream?part=${activePart}`}
                      type="video/mp4"
                    />
                    {subtitlesList.map((sub, i) => (
                      <track
                        key={i}
                        kind="subtitles"
                        src={`/api/movies/${movie.id}/stream?part=${activePart}&sub=${encodeURIComponent(sub.name)}`}
                        srcLang="pl"
                        label={`Polish (${sub.name})`}
                      />
                    ))}
                    Your browser does not support the video tag.
                  </video>
                </div>
                <p className="text-[10px] text-gray-500 italic text-center">
                  Note: MKV support varies by browser. Use "Play in VLC" for
                  best compatibility.
                </p>
              </div>
            ) : (
              description && (
                <div className="space-y-2">
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                    Plot Summary
                  </p>
                  <p className="text-gray-300 text-base leading-relaxed font-normal">
                    {description}
                  </p>
                </div>
              )
            )}

            {/* Merge Interface */}
            {isMergeMode && (
              <div className="bg-gray-800/40 rounded-2xl p-6 border border-indigo-500/30 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">
                    Merge movie records
                  </h4>
                  <button
                    onClick={() => setIsMergeMode(false)}
                    className="text-gray-500 hover:text-white transition-colors"
                  >
                    ✕
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search library to find target movie..."
                    value={mergeQuery}
                    onChange={(e) => setMergeQuery(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-all pl-10"
                    autoFocus
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 opacity-30">
                    🔍
                  </span>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  {potentialMerges.length > 0 ? (
                    potentialMerges.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => handleMerge(m.id)}
                        disabled={isMerging}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-gray-900/40 hover:bg-indigo-500/10 border border-gray-700/30 hover:border-indigo-500/30 transition-all group text-left"
                      >
                        <div>
                          <p className="text-xs font-bold text-gray-200 group-hover:text-indigo-300 transition-colors">
                            {m.title}{" "}
                            {m.year && (
                              <span className="text-gray-500">({m.year})</span>
                            )}
                          </p>
                          <p className="text-[10px] text-gray-500 font-medium">
                            {m.source} • {m.file_path ? "Local" : "Remote"}
                          </p>
                        </div>
                        <span className="text-indigo-500/50 group-hover:text-indigo-500 transition-colors">
                          →
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="text-center py-4 text-gray-500 text-xs italic">
                      {mergeQuery
                        ? "No matching movies found."
                        : "Search or select from suggestions below..."}
                    </p>
                  )}
                </div>

                <p className="text-[9px] text-gray-500 leading-relaxed italic">
                  Note: Metadata from this record will be moved to the target if
                  it's more complete. This record will be permanently deleted.
                </p>
              </div>
            )}

            {/* Subtitles Section */}
            <div className="space-y-3">
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                Subtitle Management
              </p>
              <div className="bg-gray-800/30 rounded-2xl p-5 border border-gray-700/30">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">⌨️</span>
                    <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">
                      Available Tracks
                    </span>
                  </div>
                  {hasSubtitles && (
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                      Standardized
                    </span>
                  )}
                </div>

                {filePath ? (
                  <div className="space-y-4">
                    {subtitlesList.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {subtitlesList.map((sub, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 bg-gray-900/60 px-3 py-2 rounded-xl border border-gray-700/20 group"
                          >
                            <span className="text-indigo-500 font-black text-[9px] tracking-tighter">
                              POL
                            </span>
                            <span className="text-xs text-gray-400 truncate flex-1">
                              {sub.name}
                            </span>
                            <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity text-gray-600">
                              .srt
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 bg-gray-900/40 rounded-2xl border border-dashed border-gray-700/50">
                        <p className="text-gray-500 text-xs font-medium">
                          No localized subtitles found in movie folder.
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <a
                        href={`https://www.opensubtitles.org/en/search2/moviename-${encodeURIComponent(movie.title)}/sublanguageid-pol`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 py-3 rounded-xl transition-all"
                      >
                        <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">
                          Search OpenSubtitles
                        </span>
                        <span className="text-sm">↗</span>
                      </a>

                      <label
                        className={`cursor-pointer border-2 border-dashed rounded-xl transition-all flex items-center justify-center gap-3 py-3 ${
                          isSubtitleUploading
                            ? "bg-gray-800/50 border-gray-700 text-gray-500 cursor-not-allowed"
                            : isDraggingSub
                              ? "bg-indigo-500/10 border-indigo-500 text-indigo-400 scale-[1.02]"
                              : "bg-gray-800/30 border-gray-700/50 text-gray-400 hover:bg-indigo-500/5 hover:border-indigo-500/30 hover:text-indigo-300"
                        }`}
                        onDragOver={onDragOverSub}
                        onDragLeave={onDragLeaveSub}
                        onDrop={onDropSub}
                      >
                        <span className="text-lg">
                          {isSubtitleUploading
                            ? "⏳"
                            : isDraggingSub
                              ? "✨"
                              : "📁"}
                        </span>
                        <span className="text-xs font-black uppercase tracking-widest">
                          {isSubtitleUploading
                            ? "Uploading..."
                            : isDraggingSub
                              ? "Drop Subtitle"
                              : "Drop .srt here"}
                        </span>
                        <input
                          type="file"
                          accept=".srt,.sub,.txt,.ass"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleSubtitleUpload(file);
                          }}
                          disabled={isSubtitleUploading}
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500 text-sm mb-4 italic">
                      Metadata only. Link a local file to manage subtitles.
                    </p>
                    <a
                      href={`https://www.opensubtitles.org/en/search2/moviename-${encodeURIComponent(movie.title)}/sublanguageid-pol`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-xs font-black text-indigo-400 uppercase tracking-widest hover:text-indigo-300 transition-colors"
                    >
                      OpenSubtitles.org ↗
                    </a>
                  </div>
                )}

                {subtitleError && (
                  <p className="mt-3 px-3 py-2 bg-red-500/10 text-red-400 text-[10px] font-bold uppercase rounded-lg border border-red-500/20 text-center">
                    {subtitleError}
                  </p>
                )}
              </div>
            </div>

            {/* File Path Management */}
            {filePath && (
              <div className="space-y-3">
                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                  Storage & File System
                </p>
                <div className="bg-gray-800/40 rounded-2xl p-5 border border-gray-700/30 space-y-4">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <div className="p-2 bg-gray-900/60 rounded-lg shrink-0">
                          <span className="text-sm">📂</span>
                        </div>
                        <p className="text-gray-300 text-xs font-mono break-all bg-gray-900/40 px-3 py-2 rounded-lg border border-gray-700/20 flex-1 leading-relaxed">
                          {filePath}
                          {movie.extra_files &&
                            JSON.parse(movie.extra_files).length > 0 && (
                              <span className="ml-2 px-1 py-0.5 bg-indigo-500/20 text-indigo-400 text-[9px] font-black rounded uppercase">
                                Part 1
                              </span>
                            )}
                        </p>
                      </div>
                      <div className="shrink-0 flex justify-end">
                        {isStandard || isStandardNoYear ? (
                          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20">
                            <span className="text-xs">✅</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-green-400">
                              Standard
                            </span>
                          </div>
                        ) : (
                          <button
                            onClick={handleStandardize}
                            disabled={isStandardizing}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 transition-colors disabled:opacity-50"
                          >
                            <span className="text-xs">
                              {isStandardizing ? "⏳" : "✨"}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-widest">
                              Standardize
                            </span>
                          </button>
                        )}
                      </div>
                    </div>

                    {movie.extra_files &&
                      JSON.parse(movie.extra_files).map(
                        (extraPath: string, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2 pl-4 border-l-2 border-gray-700/50"
                          >
                            <div className="p-2 bg-gray-900/60 rounded-lg shrink-0">
                              <span className="text-sm">🎞️</span>
                            </div>
                            <p className="text-gray-400 text-[10px] font-mono break-all bg-gray-900/20 px-3 py-2 rounded-lg border border-gray-700/10 flex-1 leading-relaxed">
                              {extraPath}
                              <span className="ml-2 px-1 py-0.5 bg-indigo-500/10 text-indigo-500/60 text-[9px] font-black rounded uppercase">
                                Part {idx + 2}
                              </span>
                            </p>
                          </div>
                        ),
                      )}
                  </div>

                  {standardizeMsg && (
                    <div
                      className={`p-4 rounded-xl border animate-in fade-in slide-in-from-top-2 duration-300 ${
                        standardizeMsg.type === "success"
                          ? "bg-green-500/5 border-green-500/20 text-green-400"
                          : "bg-red-500/5 border-red-500/20 text-red-400"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-sm mt-0.5">
                          {standardizeMsg.type === "success" ? "✨" : "⚠️"}
                        </span>
                        <div className="flex-1">
                          <p className="text-[10px] font-black uppercase tracking-widest mb-1">
                            {standardizeMsg.type === "success"
                              ? "Library Synced"
                              : "Action Required"}
                          </p>
                          <p className="text-xs font-medium leading-relaxed">
                            {standardizeMsg.text}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="flex items-center gap-6 pt-4 border-t border-gray-800">
              {movie.created_at && (
                <div className="space-y-1">
                  <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest">
                    Added to Library
                  </p>
                  <p className="text-[11px] text-gray-500 font-medium">
                    {new Date(movie.created_at).toLocaleDateString()}
                  </p>
                </div>
              )}
              {movie.rated_at && (
                <div className="space-y-1">
                  <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest">
                    Last Rated
                  </p>
                  <p className="text-[11px] text-gray-500 font-medium">
                    {movie.rated_at}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
