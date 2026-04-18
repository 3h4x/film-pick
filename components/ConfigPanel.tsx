"use client";

import { useState, useEffect } from "react";

const ALL_GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "History",
  "Horror",
  "Music",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "TV Movie",
  "Thriller",
  "War",
  "Western",
];

export interface RecConfig {
  excluded_genres: string[];
  min_year: number | null;
  min_rating: number | null;
  max_per_group: number;
}

const DEFAULTS: RecConfig = {
  excluded_genres: [],
  min_year: null,
  min_rating: null,
  max_per_group: 15,
};

interface ConfigPanelProps {
  config: RecConfig;
  onSave: (config: RecConfig) => void;
  tmdbKeySource: "env" | "db" | null;
  disabledEngines: string[];
  engines: { value: string; label: string }[];
  onToggleEngine: (engineKey: string) => void;
  libraryPath: string | null;
  onSaveLibraryPath: (path: string) => Promise<void>;
  onSync: () => void;
}

export default function ConfigPanel({ config, onSave, tmdbKeySource, disabledEngines, engines, onToggleEngine, libraryPath, onSaveLibraryPath, onSync }: ConfigPanelProps) {
  const [draft, setDraft] = useState<RecConfig>(config);
  const [dirty, setDirty] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeySource, setApiKeySource] = useState(tmdbKeySource);
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [pathDraft, setPathDraft] = useState(libraryPath || "");
  const [pathSaving, setPathSaving] = useState(false);
  const [pathSaved, setPathSaved] = useState(false);
  const [backupState, setBackupState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [backupFile, setBackupFile] = useState<string | null>(null);
  const [backupStats, setBackupStats] = useState<{ lastBackup: string | null; count: number } | null>(null);
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [cdaInterval, setCdaInterval] = useState<0 | 6 | 12 | 24>(0);
  const [cdaStatus, setCdaStatus] = useState<"idle" | "running" | "error">("idle");
  const [cdaLastRefresh, setCdaLastRefresh] = useState<string | null>(null);
  const [cdaMovieCount, setCdaMovieCount] = useState<number | null>(null);

  useEffect(() => {
    setDraft(config);
    setDirty(false);
  }, [config]);

  useEffect(() => {
    setApiKeySource(tmdbKeySource);
  }, [tmdbKeySource]);

  useEffect(() => {
    setPathDraft(libraryPath || "");
  }, [libraryPath]);

  useEffect(() => {
    fetch("/api/backup").then((r) => r.json()).then(setBackupStats);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        setBackupEnabled(s.backup_enabled ?? true);
        setCdaInterval(s.cda_refresh_interval_hours ?? 0);
        setCdaStatus(s.cda_refresh_status ?? "idle");
        setCdaLastRefresh(s.cda_last_refresh ?? null);
        setCdaMovieCount(s.cda_movie_count ?? null);
      });
  }, []);

  useEffect(() => {
    if (cdaStatus !== "running") return;
    const timer = setInterval(() => {
      fetch("/api/settings")
        .then((r) => r.json())
        .then((s) => {
          setCdaStatus(s.cda_refresh_status ?? "idle");
          if (s.cda_refresh_status !== "running") {
            setCdaLastRefresh(s.cda_last_refresh ?? null);
            setCdaMovieCount(s.cda_movie_count ?? null);
          }
        });
    }, 3000);
    return () => clearInterval(timer);
  }, [cdaStatus]);

  async function handleBackup() {
    setBackupState("running");
    setBackupFile(null);
    try {
      const res = await fetch("/api/backup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBackupFile(data.filename);
      setBackupStats({ lastBackup: data.lastBackup, count: data.count });
      setBackupState("done");
      setTimeout(() => setBackupState("idle"), 4000);
    } catch {
      setBackupState("error");
      setTimeout(() => setBackupState("idle"), 3000);
    }
  }

  async function handleSavePath() {
    setPathSaving(true);
    await onSaveLibraryPath(pathDraft.trim());
    setPathSaving(false);
    setPathSaved(true);
    setTimeout(() => setPathSaved(false), 2000);
  }

  function update(partial: Partial<RecConfig>) {
    setDraft((prev) => ({ ...prev, ...partial }));
    setDirty(true);
  }

  function toggleGenre(genre: string) {
    const excluded = draft.excluded_genres.includes(genre)
      ? draft.excluded_genres.filter((g) => g !== genre)
      : [...draft.excluded_genres, genre];
    update({ excluded_genres: excluded });
  }

  function handleSave() {
    onSave(draft);
    setDirty(false);
  }

  function handleReset() {
    setDraft(DEFAULTS);
    setDirty(true);
  }

  async function saveApiKey() {
    setApiKeySaving(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdb_api_key: apiKey }),
    });
    setApiKeySource(apiKey.trim() ? "db" : null);
    setApiKey("");
    setApiKeySaving(false);
  }

  return (
    <div className="max-w-2xl space-y-10">

      {/* ── Library ─────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-5">Library</h2>
        <div className="space-y-8">

          {/* Library Path */}
          <section>
            <h3 className="text-white font-semibold text-sm mb-1">Library Path</h3>
            <p className="text-gray-500 text-xs mb-3">
              Directory to scan for video files. Used for import and sync.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={pathDraft}
                onChange={(e) => setPathDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSavePath()}
                placeholder="/Volumes/video/Movies"
                className="flex-1 bg-gray-800/60 border border-gray-700/30 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-indigo-500/50 placeholder-gray-600"
              />
              <button
                onClick={handleSavePath}
                disabled={pathSaving || !pathDraft.trim() || pathDraft.trim() === libraryPath}
                className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {pathSaving ? "Saving..." : pathSaved ? "Saved" : "Save"}
              </button>
              {libraryPath && (
                <button
                  onClick={onSync}
                  className="px-4 py-2 text-sm rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
                >
                  Sync Now
                </button>
              )}
            </div>
            {libraryPath && (
              <p className="text-gray-600 text-xs mt-2 font-mono">
                Current: {libraryPath}
              </p>
            )}
          </section>

          {/* Backup */}
          <section>
            <h3 className="text-white font-semibold text-sm mb-1">Database Backup</h3>
            <p className="text-gray-500 text-xs mb-3">
              Auto-backup every 15 minutes with tiered retention. Backups stored in <span className="font-mono">data/backups/</span>.
            </p>
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={async () => {
                  const next = !backupEnabled;
                  setBackupEnabled(next);
                  const res = await fetch("/api/settings", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ backup_enabled: next }),
                  });
                  if (!res.ok) setBackupEnabled(!next);
                }}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  backupEnabled
                    ? "bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30"
                    : "bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30"
                }`}
              >
                {backupEnabled ? "Auto-backup: On" : "Auto-backup: Off"}
              </button>
              <button
                onClick={handleBackup}
                disabled={backupState === "running"}
                className="px-4 py-2 text-sm rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {backupState === "running" ? "Backing up..." : "Backup Now"}
              </button>
              {backupState === "done" && backupFile && (
                <span className="text-green-400 text-xs font-mono">{backupFile}</span>
              )}
              {backupState === "error" && (
                <span className="text-red-400 text-xs">Backup failed</span>
              )}
            </div>
            {backupStats && (
              <div className="text-xs text-gray-500 space-y-0.5">
                {backupStats.lastBackup && (
                  <p>Last: <span className="font-mono text-gray-400">{backupStats.lastBackup}</span></p>
                )}
                <p>Stored: <span className="text-gray-400">{backupStats.count}</span></p>
              </div>
            )}
          </section>

        </div>
      </div>

      <hr className="border-gray-800" />

      {/* ── Integrations ────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-5">Integrations</h2>
        <div className="space-y-8">

          {/* TMDb API Key */}
          <section>
            <h3 className="text-white font-semibold text-sm mb-1">TMDb API Key</h3>
            <p className="text-gray-500 text-xs mb-3">
              Required for search and recommendations.{" "}
              {apiKeySource === "env" ? (
                <span className="text-green-400">Loaded from environment (bioenv)</span>
              ) : apiKeySource === "db" ? (
                <span className="text-yellow-400">Loaded from database (less secure)</span>
              ) : (
                <span className="text-red-400">Not configured</span>
              )}
            </p>
            {apiKeySource !== "env" && (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  placeholder={apiKeySource === "db" ? "••••••••  (replace)" : "Paste TMDb read access token"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="bg-gray-800/60 border border-gray-700/30 rounded-lg px-3 py-2 text-white text-sm flex-1 focus:outline-none focus:border-indigo-500/50"
                />
                <button
                  onClick={saveApiKey}
                  disabled={!apiKey.trim() || apiKeySaving}
                  className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {apiKeySaving ? "Saving..." : "Save"}
                </button>
                {apiKeySource === "db" && (
                  <button
                    onClick={() => { setApiKey(""); saveApiKey(); }}
                    className="px-3 py-2 text-sm rounded-lg bg-red-600/20 text-red-300 hover:bg-red-600/30 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            )}
          </section>

          {/* CDA Premium */}
          <section>
            <h3 className="text-white font-semibold text-sm mb-1">CDA Premium</h3>
            <p className="text-gray-500 text-xs mb-3">
              Auto-refresh the CDA catalog on a schedule.
            </p>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-2">Auto-refresh interval</p>
                <div className="flex gap-2">
                  {([0, 6, 12, 24] as const).map((h) => (
                    <button
                      key={h}
                      onClick={async () => {
                        const prev = cdaInterval;
                        setCdaInterval(h);
                        const res = await fetch("/api/settings", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ cda_refresh_interval_hours: h }),
                        });
                        if (!res.ok) setCdaInterval(prev);
                      }}
                      className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                        cdaInterval === h
                          ? "bg-indigo-500/30 text-indigo-300 border border-indigo-500/40"
                          : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
                      }`}
                    >
                      {h === 0 ? "Off" : `${h}h`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  disabled={cdaStatus === "running"}
                  onClick={async () => {
                    const res = await fetch("/api/cda-refresh", { method: "POST" });
                    if (res.ok) setCdaStatus("running");
                  }}
                  className="px-4 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {cdaStatus === "running" ? "Refreshing…" : "Refresh Now"}
                </button>
                {cdaStatus === "error" && (
                  <span className="text-xs text-red-400">Last refresh failed</span>
                )}
              </div>
              <div className="text-xs text-gray-500 space-y-0.5">
                <p>
                  Last refreshed:{" "}
                  <span className="text-gray-400">
                    {cdaLastRefresh
                      ? new Date(cdaLastRefresh).toLocaleString()
                      : "Never"}
                  </span>
                </p>
                {cdaMovieCount !== null && (
                  <p>
                    Movies:{" "}
                    <span className="text-gray-400">
                      {cdaMovieCount.toLocaleString()}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </section>

        </div>
      </div>

      <hr className="border-gray-800" />

      {/* ── Recommendations ─────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-5">Recommendations</h2>
        <div className="space-y-8">

          {/* Engines */}
          <section>
            <h3 className="text-white font-semibold text-sm mb-1">Engines</h3>
            <p className="text-gray-500 text-xs mb-3">
              Disabled engines won&apos;t run on page load or refresh
            </p>
            <div className="flex flex-wrap gap-2">
              {engines.map((eng) => {
                const disabled = disabledEngines.includes(eng.value);
                return (
                  <button
                    key={eng.value}
                    onClick={() => onToggleEngine(eng.value)}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-all border ${
                      disabled
                        ? "bg-red-500/20 text-red-300 border-red-500/30"
                        : "bg-green-500/20 text-green-300 border-green-500/30"
                    }`}
                  >
                    {disabled ? "✕" : "✓"} {eng.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Excluded Genres */}
          <section>
            <h3 className="text-white font-semibold text-sm mb-1">Excluded Genres</h3>
            <p className="text-gray-500 text-xs mb-3">
              Recommendations with these genres will be hidden
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL_GENRES.map((genre) => {
                const excluded = draft.excluded_genres.includes(genre);
                return (
                  <button
                    key={genre}
                    onClick={() => toggleGenre(genre)}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-all border ${
                      excluded
                        ? "bg-red-500/20 text-red-300 border-red-500/30"
                        : "bg-gray-800/60 text-gray-400 border-gray-700/30 hover:border-gray-600/50 hover:text-gray-300"
                    }`}
                  >
                    {excluded && <span className="mr-1">✕</span>}
                    {genre}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Minimum Year */}
          <section>
            <h3 className="text-white font-semibold text-sm mb-1">Minimum Year</h3>
            <p className="text-gray-500 text-xs mb-3">
              Only recommend movies released after this year
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1900}
                max={new Date().getFullYear()}
                placeholder="Any year"
                value={draft.min_year ?? ""}
                onChange={(e) =>
                  update({
                    min_year: e.target.value ? parseInt(e.target.value, 10) : null,
                  })
                }
                className="bg-gray-800/60 border border-gray-700/30 rounded-lg px-3 py-2 text-white text-sm w-32 focus:outline-none focus:border-indigo-500/50"
              />
              <div className="flex gap-1">
                {[1990, 2000, 2010, 2020].map((year) => (
                  <button
                    key={year}
                    onClick={() =>
                      update({ min_year: draft.min_year === year ? null : year })
                    }
                    className={`text-xs px-2.5 py-1.5 rounded-lg transition-all ${
                      draft.min_year === year
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                        : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                    }`}
                  >
                    {year}+
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Minimum Rating */}
          <section>
            <h3 className="text-white font-semibold text-sm mb-1">Minimum TMDb Rating</h3>
            <p className="text-gray-500 text-xs mb-3">
              Filter out recommendations below this rating
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={10}
                step={0.5}
                placeholder="Any rating"
                value={draft.min_rating ?? ""}
                onChange={(e) =>
                  update({
                    min_rating: e.target.value ? parseFloat(e.target.value) : null,
                  })
                }
                className="bg-gray-800/60 border border-gray-700/30 rounded-lg px-3 py-2 text-white text-sm w-32 focus:outline-none focus:border-indigo-500/50"
              />
              <div className="flex gap-1">
                {[6, 6.5, 7, 7.5, 8].map((r) => (
                  <button
                    key={r}
                    onClick={() =>
                      update({ min_rating: draft.min_rating === r ? null : r })
                    }
                    className={`text-xs px-2.5 py-1.5 rounded-lg transition-all ${
                      draft.min_rating === r
                        ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30"
                        : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                    }`}
                  >
                    {r}+
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Max Per Group */}
          <section>
            <h3 className="text-white font-semibold text-sm mb-1">Results Per Group</h3>
            <p className="text-gray-500 text-xs mb-3">
              Maximum number of recommendations in each group
            </p>
            <div className="flex gap-1">
              {[5, 10, 15, 20, 30].map((n) => (
                <button
                  key={n}
                  onClick={() => update({ max_per_group: n })}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
                    draft.max_per_group === n
                      ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                      : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </section>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={!dirty}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                dirty
                  ? "bg-indigo-500 text-white hover:bg-indigo-400 shadow-md shadow-indigo-500/20"
                  : "bg-gray-800/60 text-gray-600 cursor-default"
              }`}
            >
              Save & Refresh Recommendations
            </button>
            <button
              onClick={handleReset}
              className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              Reset to defaults
            </button>
            {dirty && (
              <span className="text-yellow-500/70 text-xs">Unsaved changes</span>
            )}
          </div>

        </div>
      </div>

    </div>
  );
}
