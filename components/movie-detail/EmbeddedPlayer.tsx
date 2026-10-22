"use client";

import { SUBTITLE_LANGUAGE_LABELS, subtitleTrackLanguage } from "@/lib/subtitle-language";
import { useEffect, useMemo, useState } from "react";
import type { SubtitleTrack } from "@/components/movie-detail/types";
import {
  browserCanDecode,
  planPlayback,
  type PlaybackMetadata,
  type PlaybackMode,
} from "@/lib/playback";

interface EmbeddedPlayerProps {
  movieId: number;
  posterUrl: string | null;
  filePath: string;
  extraFiles: string[];
  activePart: number;
  subtitlesList: SubtitleTrack[];
  videoMetadata: PlaybackMetadata | null;
  onSelectPart: (part: number) => void;
  onPlayExternal: () => void;
  onClose: () => void;
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export default function EmbeddedPlayer({
  movieId,
  posterUrl,
  filePath,
  extraFiles,
  activePart,
  subtitlesList,
  videoMetadata,
  onSelectPart,
  onPlayExternal,
  onClose,
}: EmbeddedPlayerProps) {
  const activeFile = [filePath, ...extraFiles][activePart] ?? filePath;
  const plan = useMemo(
    () => planPlayback(activeFile, videoMetadata, browserCanDecode),
    [activeFile, videoMetadata],
  );
  // The plan can be overridden once the browser has had its say: a "direct" file
  // that fails to load gets one try in compatibility mode before giving up.
  const [mode, setMode] = useState<PlaybackMode>(plan.mode);
  const [failed, setFailed] = useState(false);
  const [offset, setOffset] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setMode(plan.mode);
    setFailed(false);
    setOffset(0);
    setElapsed(0);
  }, [plan.mode, movieId, activePart]);

  const duration = videoMetadata?.duration ?? 0;
  const isRemux = mode === "remux";
  const streamBase = `/api/movies/${movieId}/stream?part=${activePart}`;
  const src = isRemux
    ? `${streamBase}&mode=remux${offset > 0 ? `&start=${offset}` : ""}`
    : streamBase;

  const handleError = () => {
    if (mode === "direct") setMode("remux");
    else setFailed(true);
  };

  const showFallback = mode === "unsupported" || failed;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">
            Embedded Player
          </p>
          {extraFiles.length > 0 && (
            <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
              {[filePath, ...extraFiles].map((_, index) => (
                <button
                  key={index}
                  onClick={() => onSelectPart(index)}
                  className={`px-2 py-0.5 text-[9px] font-bold rounded ${
                    activePart === index
                      ? "bg-indigo-500 text-white"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  Part {index + 1}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-[10px] text-gray-500 hover:text-white font-black uppercase tracking-widest"
        >
          Close Player ×
        </button>
      </div>

      {showFallback ? (
        <div className="bg-gray-900 rounded-2xl aspect-video border border-gray-800 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-gray-300">
            {failed
              ? "This file could not be played in the browser."
              : `This file can't play in a browser${plan.reason ? ` (${plan.reason})` : ""}.`}
          </p>
          <button
            onClick={onPlayExternal}
            className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold uppercase tracking-widest"
          >
            Play in VLC
          </button>
        </div>
      ) : (
        <div className="bg-black rounded-2xl overflow-hidden aspect-video max-h-[70vh] w-full border border-gray-800 shadow-2xl relative group">
          <video
            key={`${movieId}-${activePart}-${mode}-${offset}`}
            controls
            className="w-full h-full"
            poster={posterUrl || undefined}
            autoPlay
            onError={handleError}
            onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
          >
            <source src={src} type="video/mp4" onError={handleError} />
            {subtitlesList.map((subtitle, index) => (
              <track
                key={`${subtitle.name}-${index}`}
                kind="subtitles"
                src={`${streamBase}&sub=${encodeURIComponent(subtitle.name)}${
                  isRemux && offset > 0 ? `&shift=${offset}` : ""
                }`}
                srcLang={subtitleTrackLanguage(subtitle.name)}
                label={`${subtitleTrackLanguage(subtitle.name) === "en" ? SUBTITLE_LANGUAGE_LABELS.en : subtitleTrackLanguage(subtitle.name) === "pl" ? SUBTITLE_LANGUAGE_LABELS.pl : "Subtitles"} (${subtitle.name})`}
              />
            ))}
            Your browser does not support the video tag.
          </video>
        </div>
      )}

      {isRemux && !showFallback && (
        <div className="space-y-1">
          {duration > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-gray-400 tabular-nums w-14 text-right">
                {formatClock(offset + elapsed)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.floor(duration)}
                step={10}
                value={Math.min(Math.floor(offset + elapsed), Math.floor(duration))}
                onChange={(e) => {
                  setOffset(Number(e.target.value));
                  setElapsed(0);
                }}
                className="flex-1 accent-indigo-500"
                aria-label="Seek"
              />
              <span className="text-[10px] text-gray-500 tabular-nums w-14">
                {formatClock(duration)}
              </span>
            </div>
          )}
          <p className="text-[10px] text-gray-500 italic text-center">
            Compatibility mode{plan.reason ? ` (${plan.reason})` : ""}: audio is
            converted on the fly; seek with the bar above.
          </p>
        </div>
      )}

      {mode === "direct" && !showFallback && (
        <p className="text-[10px] text-gray-500 italic text-center">
          Trouble playing?{" "}
          <button
            onClick={onPlayExternal}
            className="not-italic font-bold text-indigo-400 hover:text-indigo-300 underline-offset-2 hover:underline"
          >
            Open in VLC
          </button>
        </p>
      )}
    </div>
  );
}
