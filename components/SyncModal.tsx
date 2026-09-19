"use client";

import { useEffect, useState } from "react";
import Modal from "./ui/Modal";
import Spinner from "./ui/Spinner";
import Button from "./ui/Button";

interface SyncResult {
  added: number;
  linked: number;
  detached: number;
  unchanged: number;
  failed: number;
  total: number;
  enriched?: number;
}

interface ScanCompleteUpdate {
  type: "scan_complete";
  total: number;
  new_files: number;
  unchanged: number;
}

interface ProgressUpdate {
  type: "progress";
  current: number;
  total: number;
  filename: string;
}

interface CompleteUpdate extends SyncResult {
  type: "complete";
}

type StreamUpdate =
  | { type: "scanning"; count: number }
  | { type: "skipped_roots"; roots: string[] }
  | { type: "enriching"; current: number; total: number }
  | ScanCompleteUpdate
  | ProgressUpdate
  | CompleteUpdate;

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export default function SyncModal({
  isOpen,
  onClose,
  onComplete,
}: SyncModalProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [phase, setPhase] = useState<"idle" | "scanning" | "syncing" | "enriching">("idle");
  const [scanCount, setScanCount] = useState(0);
  const [scanComplete, setScanComplete] = useState<ScanCompleteUpdate | null>(
    null,
  );
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skippedRoots, setSkippedRoots] = useState<string[]>([]);
  const [enrichProgress, setEnrichProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSync() {
    setLoading(true);
    setError(null);
    setResult(null);
    setPhase("scanning");
    setScanCount(0);
    setScanComplete(null);
    setProgress(null);
    setSkippedRoots([]);
    setEnrichProgress(null);

    try {
      const res = await fetch("/api/sync", { method: "POST" });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Sync failed");
        setLoading(false);
        setPhase("idle");
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError("Failed to read progress stream");
        setLoading(false);
        setPhase("idle");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const update = JSON.parse(line) as StreamUpdate;
            if (update.type === "scanning") {
              setScanCount(update.count);
            } else if (update.type === "skipped_roots") {
              setSkippedRoots(update.roots);
            } else if (update.type === "enriching") {
              setPhase("enriching");
              setEnrichProgress({ current: update.current, total: update.total });
            } else if (update.type === "scan_complete") {
              setScanComplete(update);
              if (update.new_files > 0) {
                setPhase("syncing");
              }
            } else if (update.type === "progress") {
              setProgress(update);
            } else if (update.type === "complete") {
              setResult(update);
              setPhase("idle");
              onComplete();
            }
          } catch (e) {
            console.error("Failed to parse progress update", e);
          }
        }
      }
    } catch {
      setError("Failed to connect to server");
      setPhase("idle");
    } finally {
      setLoading(false);
    }
  }

  const progressPct =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <Modal title="Sync Library" labelId="sync-modal-title" onClose={onClose}>
        <p className="text-gray-400 text-sm mb-6">
          Re-scan your library folder to add new files and detach entries whose
          files are missing.
        </p>

        {!loading && !result && (
          <Button
            onClick={handleSync}
            className="w-full !bg-indigo-500 px-5 py-3 rounded-xl hover:!bg-indigo-400 !transition-all text-sm flex items-center justify-center gap-2 mb-4"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Start Sync
          </Button>
        )}

        {loading && (
          <div className="bg-gray-800/50 rounded-xl p-4 mb-4 space-y-3">
            {/* Phase 1: Scanning */}
            {phase === "scanning" && (
              <>
                <div className="flex items-center gap-3">
                  <Spinner size="md" className="flex-shrink-0" />
                  <p className="text-gray-300 text-sm">
                    Scanning files...{" "}
                    <span className="text-white font-mono">{scanCount}</span>{" "}
                    found
                  </p>
                </div>
                <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-indigo-500/50 h-full w-full animate-pulse" />
                </div>
              </>
            )}

            {/* Phase 3: TMDb details (titles, credits) for what was never fetched or is stale */}
            {phase === "enriching" && enrichProgress && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Spinner size="md" className="flex-shrink-0" />
                    <p className="text-gray-300 text-sm">
                      Fetching titles &amp; credits
                    </p>
                  </div>
                  <span className="text-indigo-400 font-mono text-sm font-medium">
                    {enrichProgress.current}/{enrichProgress.total}
                  </span>
                </div>
                <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.round((enrichProgress.current / Math.max(enrichProgress.total, 1)) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-gray-600 text-xs">
                  Only movies not refreshed in the last 30 days are fetched.
                </p>
              </>
            )}

            {/* Phase 2: Syncing metadata */}
            {phase === "syncing" && scanComplete && progress && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Spinner size="md" className="flex-shrink-0" />
                    <p className="text-gray-300 text-sm">Fetching metadata</p>
                  </div>
                  <span className="text-indigo-400 font-mono text-sm font-medium">
                    {progress.current}/{progress.total}
                  </span>
                </div>
                <p className="text-gray-500 text-xs truncate italic pl-8">
                  {progress.filename}
                </p>
                <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="text-gray-600 text-xs text-right">
                  {progressPct}%
                </p>
              </>
            )}
          </div>
        )}

        {skippedRoots.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4">
            <p className="text-amber-300 text-sm">
              Skipped folders that are not available (is the share mounted?):
            </p>
            <ul className="mt-1 font-mono text-xs text-amber-200/80">
              {skippedRoots.map((root) => (
                <li key={root}>{root}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {result && (
          <div className="bg-gray-800/50 rounded-xl p-4 space-y-2 mb-4">
            <p className="text-white font-medium text-sm">Sync complete</p>
            <div className="grid grid-cols-4 gap-2 text-sm">
              <div className="flex flex-col">
                <span className="text-gray-500 text-xs">Added</span>
                <span className="text-green-400 font-mono text-lg">
                  {result.added}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-gray-500 text-xs">Linked</span>
                <span className="text-indigo-400 font-mono text-lg">
                  {result.linked}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-gray-500 text-xs">Detached</span>
                <span className="text-red-400 font-mono text-lg">
                  {result.detached}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-gray-500 text-xs">Unchanged</span>
                <span className="text-gray-400 font-mono text-lg">
                  {result.unchanged}
                </span>
              </div>
            </div>
            {(result.enriched ?? 0) > 0 && (
              <p className="text-gray-500 text-xs mt-1">
                Fetched titles &amp; credits for {result.enriched} movie
                {result.enriched === 1 ? "" : "s"}
              </p>
            )}
            {result.failed > 0 && (
              <p className="text-yellow-500 text-xs mt-1">
                {result.failed} file{result.failed > 1 ? "s" : ""} failed to
                fetch metadata
              </p>
            )}
          </div>
        )}

        <div className="text-center">
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-sm font-medium transition-colors"
          >
            {result ? "Close" : "Cancel"}
          </button>
        </div>
    </Modal>
  );
}
