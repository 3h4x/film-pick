"use client";

import { useState } from "react";

interface ImportResult {
  added: number;
  skipped: number;
  failed: number;
  total: number;
}

interface DiscoveryUpdate {
  type: "discovery";
  count: number;
  filename: string;
}

interface ProgressUpdate {
  type: "progress";
  current: number;
  total: number;
  filename: string;
}

interface CompleteUpdate extends ImportResult {
  type: "complete";
}

type StreamUpdate = DiscoveryUpdate | ProgressUpdate | CompleteUpdate;

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  currentPath: string | null;
}

export default function ImportModal({ isOpen, onClose, onComplete, currentPath }: ImportModalProps) {
  const [path, setPath] = useState(currentPath || "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [discoveryCount, setDiscoveryCount] = useState<number>(0);
  const [discoveryFile, setDiscoveryFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleImport() {
    if (!path.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress(null);
    setDiscoveryCount(0);
    setDiscoveryFile(null);

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: path.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Import failed");
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError("Failed to read progress stream");
        setLoading(false);
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
            if (update.type === "discovery") {
              setDiscoveryCount(update.count);
              setDiscoveryFile(update.filename);
              // Clear progress when discovery is active to show "Scanning" state
              // But with interleaved, they might arrive together.
              // We'll prioritize progress display if it's available.
            } else if (update.type === "progress") {
              setProgress(update);
            } else if (update.type === "complete") {
              setResult(update);
              onComplete();
            }
          } catch (e) {
            console.error("Failed to parse progress update", e);
          }
        }
      }
    } catch {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleImport();
    if (e.key === "Escape") onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center z-50 pt-[10vh]">
      <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 w-full max-w-lg shadow-2xl shadow-black/50">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-white text-lg font-semibold">Import from Folder</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors w-8 h-8 rounded-lg hover:bg-gray-800 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <p className="text-gray-400 text-sm mb-4">
          Scan a directory for video files and automatically fetch metadata from TMDb.
          <br />
          <span className="text-xs text-indigo-400/80 mt-1 block">
            Note: Network shares (AFP/SMB) should be mounted (e.g., in <code className="bg-indigo-500/10 px-1 rounded">/Volumes/video</code>).
          </span>
        </p>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="/Volumes/video/Movies"
            className="flex-1 bg-gray-800/80 text-white px-4 py-2.5 rounded-xl border border-gray-700/50 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 focus:outline-none placeholder-gray-600 text-sm font-mono"
            autoFocus
          />
          <button
            onClick={handleImport}
            disabled={loading || !path.trim()}
            className="bg-indigo-500 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-400 disabled:opacity-50 transition-all font-medium text-sm min-w-[80px]"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
            ) : (
              "Import"
            )}
          </button>
        </div>

        {loading && (
          <div className="bg-gray-800/50 rounded-xl p-4 text-center">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />

            <div className="space-y-3">
              {discoveryCount > 0 && (
                <div className="space-y-1">
                  <p className="text-gray-400 text-sm">
                    Found <span className="text-white font-mono">{discoveryCount}</span> files
                  </p>
                  {!progress && (
                    <p className="text-gray-500 text-xs truncate max-w-full italic px-2">
                      Scanning: {discoveryFile}
                    </p>
                  )}
                </div>
              )}

              {progress ? (
                <div className="space-y-2 border-t border-gray-700/50 pt-3 mt-1">
                  <p className="text-indigo-400 text-sm font-medium">
                    Processing Metadata
                  </p>
                  <p className="text-gray-500 text-xs truncate max-w-full italic px-2">
                    {progress.filename}
                  </p>
                  <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-indigo-500 h-full w-full animate-pulse" />
                  </div>
                </div>
              ) : discoveryCount === 0 ? (
                <>
                  <p className="text-gray-400 text-sm">Initializing scan...</p>
                  <p className="text-gray-600 text-xs mt-1">This may take a while for large collections</p>
                </>
              ) : null}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {result && (
          <div className="bg-gray-800/50 rounded-xl p-4 space-y-2">
            <p className="text-white font-medium text-sm">Import complete</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-gray-400">Added: <span className="text-white">{result.added}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-400" />
                <span className="text-gray-400">Skipped: <span className="text-white">{result.skipped}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-gray-400">Failed: <span className="text-white">{result.failed}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                <span className="text-gray-400">Total files: <span className="text-white">{result.total}</span></span>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 text-xs text-gray-600">
          Supported: .mp4, .mkv, .avi, .wmv, .m4v, .mov, .flv, .webm
        </div>
      </div>
    </div>
  );
}
