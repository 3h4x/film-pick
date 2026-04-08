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
}

export default function ConfigPanel({ config, onSave, tmdbKeySource, disabledEngines, engines, onToggleEngine }: ConfigPanelProps) {
  const [draft, setDraft] = useState<RecConfig>(config);
  const [dirty, setDirty] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeySource, setApiKeySource] = useState(tmdbKeySource);
  const [apiKeySaving, setApiKeySaving] = useState(false);

  useEffect(() => {
    setDraft(config);
    setDirty(false);
  }, [config]);

  useEffect(() => {
    setApiKeySource(tmdbKeySource);
  }, [tmdbKeySource]);

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
    <div className="max-w-2xl space-y-8">
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

      {/* Recommendation Engines */}
      <section>
        <h3 className="text-white font-semibold text-sm mb-1">Recommendation Engines</h3>
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
        <h3 className="text-white font-semibold text-sm mb-1">
          Excluded Genres
        </h3>
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
        <h3 className="text-white font-semibold text-sm mb-1">
          Minimum TMDb Rating
        </h3>
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
        <h3 className="text-white font-semibold text-sm mb-1">
          Results Per Group
        </h3>
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
  );
}
