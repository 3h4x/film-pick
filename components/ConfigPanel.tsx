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
  movie_seed_min_rating?: number;
  movie_seed_count?: number;
  use_tmdb_similar?: boolean;
  actor_min_appearances?: number;
  director_min_films?: number;
}

const DEFAULTS: RecConfig = {
  excluded_genres: [],
  min_year: null,
  min_rating: null,
  max_per_group: 15,
  movie_seed_min_rating: 7,
  movie_seed_count: 10,
  use_tmdb_similar: true,
  actor_min_appearances: 2,
  director_min_films: 2,
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

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-5">
      {children}
    </h2>
  );
}

function SubHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-white font-semibold text-sm mb-1">{children}</h3>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-gray-500 text-xs mb-3">{children}</p>;
}

function PillButton({
  active,
  onClick,
  children,
  color = "indigo",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  color?: "indigo" | "yellow" | "green" | "red";
}) {
  const activeClass = {
    indigo: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
    yellow: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    green: "bg-green-500/20 text-green-300 border-green-500/30",
    red: "bg-red-500/20 text-red-300 border-red-500/30",
  }[color];
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
        active
          ? activeClass
          : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

export default function ConfigPanel({
  config,
  onSave,
  tmdbKeySource,
  disabledEngines,
  engines,
  onToggleEngine,
  libraryPath,
  onSaveLibraryPath,
  onSync,
}: ConfigPanelProps) {
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
    setDraft({ ...DEFAULTS, ...config });
    setDirty(false);
  }, [config]);

  useEffect(() => { setApiKeySource(tmdbKeySource); }, [tmdbKeySource]);
  useEffect(() => { setPathDraft(libraryPath || ""); }, [libraryPath]);

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
        <SectionHeader>Library</SectionHeader>
        <div className="space-y-8">

          <section>
            <SubHeader>Library Path</SubHeader>
            <Hint>Directory to scan for video files. Used for import and sync.</Hint>
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
              <p className="text-gray-600 text-xs mt-2 font-mono">Current: {libraryPath}</p>
            )}
          </section>

          <section>
            <SubHeader>Database Backup</SubHeader>
            <Hint>
              Auto-backup every 15 minutes with tiered retention. Stored in{" "}
              <span className="font-mono">data/backups/</span>.
            </Hint>
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
        <SectionHeader>Integrations</SectionHeader>
        <div className="space-y-8">

          <section>
            <SubHeader>TMDb API Key</SubHeader>
            <Hint>
              Required for search and recommendations.{" "}
              {apiKeySource === "env" ? (
                <span className="text-green-400">Loaded from environment (bioenv)</span>
              ) : apiKeySource === "db" ? (
                <span className="text-yellow-400">Loaded from database (less secure)</span>
              ) : (
                <span className="text-red-400">Not configured</span>
              )}
            </Hint>
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

          <section>
            <SubHeader>CDA Premium</SubHeader>
            <Hint>Auto-refresh the CDA catalog on a schedule.</Hint>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-2">Auto-refresh interval</p>
                <div className="flex gap-2">
                  {([0, 6, 12, 24] as const).map((h) => (
                    <PillButton
                      key={h}
                      active={cdaInterval === h}
                      color="indigo"
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
                    >
                      {h === 0 ? "Off" : `${h}h`}
                    </PillButton>
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
                    {cdaLastRefresh ? new Date(cdaLastRefresh).toLocaleString() : "Never"}
                  </span>
                </p>
                {cdaMovieCount !== null && (
                  <p>Movies: <span className="text-gray-400">{cdaMovieCount.toLocaleString()}</span></p>
                )}
              </div>
            </div>
          </section>

        </div>
      </div>

      <hr className="border-gray-800" />

      {/* ── Recommendations ─────────────────────────────────── */}
      <div>
        <SectionHeader>Recommendations</SectionHeader>
        <div className="space-y-10">

          {/* Engines */}
          <section>
            <SubHeader>Engines</SubHeader>
            <Hint>Disabled engines won&apos;t run on page load or refresh.</Hint>
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

          {/* Filters */}
          <section>
            <SubHeader>Filters</SubHeader>
            <Hint>Applied to all recommendation results before they&apos;re shown.</Hint>
            <div className="space-y-5">

              {/* Excluded Genres */}
              <div>
                <p className="text-xs text-gray-500 mb-2">Excluded genres</p>
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
              </div>

              {/* Min Year + Min Rating side by side */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs text-gray-500 mb-2">Minimum year</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="number"
                      min={1900}
                      max={new Date().getFullYear()}
                      placeholder="Any"
                      value={draft.min_year ?? ""}
                      onChange={(e) =>
                        update({ min_year: e.target.value ? parseInt(e.target.value, 10) : null })
                      }
                      className="bg-gray-800/60 border border-gray-700/30 rounded-lg px-3 py-2 text-white text-sm w-24 focus:outline-none focus:border-indigo-500/50"
                    />
                    <div className="flex gap-1">
                      {[1990, 2000, 2010, 2020].map((year) => (
                        <PillButton
                          key={year}
                          active={draft.min_year === year}
                          color="indigo"
                          onClick={() => update({ min_year: draft.min_year === year ? null : year })}
                        >
                          {year}+
                        </PillButton>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-2">Minimum TMDb rating</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step={0.5}
                      placeholder="Any"
                      value={draft.min_rating ?? ""}
                      onChange={(e) =>
                        update({ min_rating: e.target.value ? parseFloat(e.target.value) : null })
                      }
                      className="bg-gray-800/60 border border-gray-700/30 rounded-lg px-3 py-2 text-white text-sm w-24 focus:outline-none focus:border-indigo-500/50"
                    />
                    <div className="flex gap-1">
                      {[6, 6.5, 7, 7.5, 8].map((r) => (
                        <PillButton
                          key={r}
                          active={draft.min_rating === r}
                          color="yellow"
                          onClick={() => update({ min_rating: draft.min_rating === r ? null : r })}
                        >
                          {r}+
                        </PillButton>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </section>

          {/* Engine Tuning */}
          <section>
            <SubHeader>Engine Tuning</SubHeader>
            <Hint>Controls how each recommendation engine selects candidates.</Hint>
            <div className="space-y-5">

              {/* Similar Movies */}
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 space-y-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Similar Movies</p>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Seed min. rating</p>
                    <Hint>Only use movies you rated at least this highly as seeds.</Hint>
                    <div className="flex gap-1 flex-wrap">
                      {[5, 6, 7, 8, 9].map((r) => (
                        <PillButton
                          key={r}
                          active={draft.movie_seed_min_rating === r}
                          color="indigo"
                          onClick={() => update({ movie_seed_min_rating: r })}
                        >
                          {r}+
                        </PillButton>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 mb-2">Number of seeds</p>
                    <Hint>How many of your top-rated movies to use as seeds.</Hint>
                    <div className="flex gap-1 flex-wrap">
                      {[5, 10, 15, 20].map((n) => (
                        <PillButton
                          key={n}
                          active={draft.movie_seed_count === n}
                          color="indigo"
                          onClick={() => update({ movie_seed_count: n })}
                        >
                          {n}
                        </PillButton>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-2">TMDb Similar endpoint</p>
                  <Hint>
                    Also fetch genre/keyword-matched movies alongside TMDb&apos;s curated recommendations.
                  </Hint>
                  <button
                    onClick={() => update({ use_tmdb_similar: !draft.use_tmdb_similar })}
                    className={`px-4 py-2 text-sm rounded-lg transition-colors border ${
                      draft.use_tmdb_similar
                        ? "bg-green-500/20 text-green-300 border-green-500/30 hover:bg-green-500/30"
                        : "bg-red-500/20 text-red-300 border-red-500/30 hover:bg-red-500/30"
                    }`}
                  >
                    {draft.use_tmdb_similar ? "On" : "Off"}
                  </button>
                </div>
              </div>

              {/* People */}
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 space-y-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">People</p>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Actor min. appearances</p>
                    <Hint>An actor must appear in this many of your rated movies to qualify.</Hint>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <PillButton
                          key={n}
                          active={draft.actor_min_appearances === n}
                          color="indigo"
                          onClick={() => update({ actor_min_appearances: n })}
                        >
                          {n}
                        </PillButton>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 mb-2">Director min. films</p>
                    <Hint>A director must have directed this many of your rated movies to qualify.</Hint>
                    <div className="flex gap-1">
                      {[1, 2, 3].map((n) => (
                        <PillButton
                          key={n}
                          active={draft.director_min_films === n}
                          color="indigo"
                          onClick={() => update({ director_min_films: n })}
                        >
                          {n}
                        </PillButton>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Display */}
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Display</p>
                <p className="text-xs text-gray-500 mb-2">Results per group</p>
                <Hint>Maximum number of recommendations shown in each group.</Hint>
                <div className="flex gap-1">
                  {[5, 10, 15, 20, 30].map((n) => (
                    <PillButton
                      key={n}
                      active={draft.max_per_group === n}
                      color="indigo"
                      onClick={() => update({ max_per_group: n })}
                    >
                      {n}
                    </PillButton>
                  ))}
                </div>
              </div>

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
