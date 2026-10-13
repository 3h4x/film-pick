"use client";

import type { StandardizeMessage } from "@/components/movie-detail/types";
import { describeStandardizeProgress } from "@/lib/standardize-progress";
import type { StandardizeJob } from "@/lib/types";

interface StorageSectionProps {
  filePath: string;
  extraFiles: string[];
  isStandard: boolean;
  isStandardNoYear: boolean;
  isStandardizing: boolean;
  standardizeProgress: StandardizeJob | null;
  standardizeMsg: StandardizeMessage | null;
  onStandardize: () => void;
}

export default function StorageSection({
  filePath,
  extraFiles,
  isStandard,
  isStandardNoYear,
  isStandardizing,
  standardizeProgress,
  standardizeMsg,
  onStandardize,
}: StorageSectionProps) {
  const progress = standardizeProgress
    ? describeStandardizeProgress(standardizeProgress)
    : null;

  return (
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
                {extraFiles.length > 0 && (
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
                  onClick={onStandardize}
                  disabled={isStandardizing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 transition-colors disabled:opacity-50"
                >
                  <span className="text-xs">{isStandardizing ? "⏳" : "✨"}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {isStandardizing ? "Moving..." : "Standardize"}
                  </span>
                </button>
              )}
            </div>
          </div>

          {extraFiles.map((extraPath, index) => (
            <div
              key={`${extraPath}-${index}`}
              className="flex items-start gap-2 pl-4 border-l-2 border-gray-700/50"
            >
              <div className="p-2 bg-gray-900/60 rounded-lg shrink-0">
                <span className="text-sm">🎞️</span>
              </div>
              <p className="text-gray-400 text-[10px] font-mono break-all bg-gray-900/20 px-3 py-2 rounded-lg border border-gray-700/10 flex-1 leading-relaxed">
                {extraPath}
                <span className="ml-2 px-1 py-0.5 bg-indigo-500/10 text-indigo-500/60 text-[9px] font-black rounded uppercase">
                  Part {index + 2}
                </span>
              </p>
            </div>
          ))}
        </div>

        {isStandardizing && (
          <div className="px-4 py-3 rounded-xl border bg-indigo-500/5 border-indigo-500/20 text-indigo-300 space-y-2">
            <div className="flex items-baseline justify-between gap-3 text-[10px] font-black uppercase tracking-widest">
              <span>Moving into your library</span>
              {progress?.percent != null && <span>{progress.percent}%</span>}
            </div>
            <div
              role="progressbar"
              aria-label="Standardize progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress?.percent ?? undefined}
              className="h-1.5 rounded-full bg-gray-900/60 overflow-hidden"
            >
              {progress?.percent != null ? (
                <div
                  className="h-full rounded-full bg-indigo-400 transition-[width] duration-700"
                  style={{ width: `${progress.percent}%` }}
                />
              ) : (
                <div className="h-full w-1/3 rounded-full bg-indigo-400/60 animate-pulse" />
              )}
            </div>
            <p className="text-xs font-medium leading-relaxed text-indigo-300/80">
              {[progress?.sizeLabel, progress?.elapsedLabel, progress?.remainingLabel]
                .filter(Boolean)
                .join(" · ") || "Starting…"}
            </p>
            <p className="text-[11px] leading-relaxed text-indigo-300/60">
              It keeps going on the server if you close this; reopen the movie to
              check on it.
            </p>
          </div>
        )}

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
  );
}
