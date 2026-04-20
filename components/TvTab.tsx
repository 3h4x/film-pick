"use client";

import { useState, useEffect, useCallback } from "react";
import { EPG_PRESETS, DEFAULT_EPG_URL } from "@/lib/epg-presets";

// Polsat Box S — film channels with good quality/quantity balance
const BOX_S_CHANNELS = [
  // Dedicated film channels
  "Polsat Film", "Polsat Film 2", "Stopklatka",
  // General entertainment — reliable film schedulers
  "Polsat", "Polsat 2", "Super Polsat", "Polsat Play",
  "TV Puls", "Puls 2", "TV 4", "TVN", "TVN 7",
  "TVP 1", "TVP 2",
  // Quality/art cinema
  "TVP Kultura", "TVP Historia",
  // Secondary
  "Nowa TV",
];

// Keywords in channel names to exclude when "Films" filter is on
const FILM_EXCLUDED_KEYWORDS = [
  "sport", "music", "muzyka", "disco polo", "polo tv", "eska", "jazz",
  "nuta", "mixtape", "musicbox", "vox music", "junior music",
  "nature", "wild", "animal", "earth", "love nature",
  "news", "polityka", "wydarzenia", "republika", "wpolsce", "echo24",
  "kuchnia", "food", "lifestyle", "remonty", "home tv",
  "jim jam", "cbeebies", "nickelodeon", "disney", "minimini", "teletoon",
  "top kids", "duck tv", "junior", "tvp abc",
  "trwam", "tbn", "god tv", "daystar", "sbn",
  "fashion", "studiomed", "biznes", "water planet",
  "games", "travelxp", "explore", "da vinci", "davinci",
  "zoom tv", "doku", "geographic", "natgeo", "extreme", "playboy",
  "fokus", "reality", "rodzina", "seriale", "comedy central",
  "crime investigation", "rozrywka", "tvp 3", "tvt", "tv6", "ttv",
  // German channels (niem. = niemiecki = German in Polish EPG)
  "niem", "rtlzwei", "rtl2", "prosieben", "kabel eins", "sat.1", "zdf", "ard",
];

// Allowed trailing words in EPG channel names that don't change identity
const EPG_OK_SUFFIXES = new Set(["hd", "4k", "sd", "tv"]);

function epgWords(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}

function matchesBoxS(epgName: string): boolean {
  const ew = epgWords(epgName);
  for (const ch of BOX_S_CHANNELS) {
    const bw = epgWords(ch);
    if (!bw.length || ew.length < bw.length) continue;
    if (!bw.every((w, i) => ew[i] === w)) continue;
    // Extra words in EPG name must all be harmless suffixes (HD, TV, 4K, etc.)
    if (ew.slice(bw.length).every((w) => EPG_OK_SUFFIXES.has(w))) return true;
  }
  return false;
}

function isFilmBlockedChannel(name: string): boolean {
  const lower = name.toLowerCase();
  return FILM_EXCLUDED_KEYWORDS.some((kw) => lower.includes(kw));
}

interface EpgChannel {
  id: string;
  name: string;
  icon: string | null;
}

interface EpgProgram {
  channel: string;
  title: string;
  start: string;
  stop: string;
  description: string | null;
  category: string | null;
  icon: string | null;
  rating: string | null;
}

interface TvData {
  channels: EpgChannel[];
  programs: EpgProgram[];
  cachedAt: string;
  epgUrl: string;
  cached: boolean;
  error?: string;
}

interface EnrichResult {
  rating: number | null;
  year: number | null;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pl", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTime(iso: string, now: Date): string {
  const diff = Math.round((new Date(iso).getTime() - now.getTime()) / 60000);
  if (diff <= 0) return "";
  if (diff < 60) return `za ${diff} min`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m > 0 ? `za ${h}h ${m}min` : `za ${h}h`;
}

function channelLabel(name: string): string {
  return name.replace(/\s*(HD|4K|SD)\s*$/i, "").trim();
}

function isMovie(category: string | null): boolean {
  if (!category) return false;
  const c = category.toLowerCase();
  return c.includes("film") || c.includes("movie") || c.includes("kino");
}

interface EpgConfig {
  epg_url: string;
  epg_enabled: boolean;
  epg_refresh_interval_hours: number;
  epg_last_refresh: string | null;
  epg_status: "idle" | "running" | "error";
}

export default function TvTab() {
  const [data, setData] = useState<TvData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [moviesOnly, setMoviesOnly] = useState(true);
  const [tvView, setTvView] = useState<"films" | "config">("films");
  const [now, setNow] = useState(() => new Date());
  const [enrich, setEnrich] = useState<Record<string, EnrichResult>>({});
  const [blacklist, setBlacklist] = useState<Set<string>>(new Set());
  const [epgConfig, setEpgConfig] = useState<EpgConfig | null>(null);
  const [epgUrlInput, setEpgUrlInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Load blacklist from DB
  useEffect(() => {
    fetch("/api/tv/blacklist")
      .then((r) => r.json())
      .then((list: string[]) => setBlacklist(new Set(list)))
      .catch(() => {});
  }, []);

  // Load EPG config
  const loadEpgConfig = useCallback(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        const cfg: EpgConfig = {
          epg_url: s.epg_url ?? "",
          epg_enabled: s.epg_enabled ?? true,
          epg_refresh_interval_hours: s.epg_refresh_interval_hours ?? 0,
          epg_last_refresh: s.epg_last_refresh ?? null,
          epg_status: s.epg_status ?? "idle",
        };
        setEpgConfig(cfg);
        setEpgUrlInput(cfg.epg_url);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadEpgConfig(); }, [loadEpgConfig]);

  function saveBlacklist(next: Set<string>) {
    setBlacklist(next);
    fetch("/api/tv/blacklist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([...next]),
    }).catch(() => {});
  }

  function blacklistChannel(channelId: string) {
    const next = new Set(blacklist);
    next.add(channelId);
    saveBlacklist(next);
  }

  function unblacklistChannel(channelId: string) {
    const next = new Set(blacklist);
    next.delete(channelId);
    saveBlacklist(next);
  }

  function clearBlacklist() {
    saveBlacklist(new Set());
  }

  async function saveEpgUrl() {
    setSaving(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epg_url: epgUrlInput }),
    }).catch(() => {});
    await loadEpgConfig();
    setSaving(false);
  }

  async function saveEpgInterval(hours: number) {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epg_refresh_interval_hours: hours }),
    }).catch(() => {});
    loadEpgConfig();
  }

  async function triggerRefresh() {
    await fetch("/api/tv/refresh", { method: "POST" }).catch(() => {});
    setTimeout(() => { load(false); loadEpgConfig(); }, 2000);
  }

  const load = useCallback((bust = false) => {
    setLoading(true);
    fetch(`/api/tv${bust ? "?bust=1" : ""}`)
      .then((r) => r.json())
      .then((d: TvData) => setData(d))
      .catch(() =>
        setData({
          channels: [],
          programs: [],
          cachedAt: new Date().toISOString(),
          epgUrl: "",
          cached: false,
          error: "Network error",
        }),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, [load]);

  // Enrich film titles with TMDb ratings/years once data arrives
  useEffect(() => {
    if (!data?.programs?.length) return;
    const titles = [
      ...new Set(
        data.programs
          .filter((p) => isMovie(p.category))
          .map((p) => p.title),
      ),
    ];
    if (titles.length === 0) return;
    fetch("/api/tv/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titles }),
    })
      .then((r) => r.json())
      .then((d: Record<string, EnrichResult>) => setEnrich(d))
      .catch(() => {});
  }, [data]);

  function getCurrentProgram(channelId: string): EpgProgram | null {
    return (
      (data?.programs ?? []).find(
        (p) =>
          p.channel === channelId &&
          new Date(p.start) <= now &&
          new Date(p.stop) > now,
      ) ?? null
    );
  }

  function getUpcoming(channelId: string, count = 3): EpgProgram[] {
    return (data?.programs ?? [])
      .filter((p) => p.channel === channelId && new Date(p.start) > now)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, count);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (data?.error) {
    return (
      <div className="text-center py-24 space-y-3">
        <p className="text-gray-400 font-medium">Failed to load TV guide</p>
        <p className="text-gray-600 text-sm">{data.error}</p>
        <p className="text-gray-700 text-xs">
          Check the EPG URL in Config (Settings → EPG URL)
        </p>
        <button
          onClick={() => load(true)}
          className="mt-2 px-4 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const programs = data?.programs ?? [];
  const channels = data?.channels ?? [];

  // Only channels that have any programs today
  const withPrograms = channels.filter((ch) =>
    programs.some((p) => p.channel === ch.id),
  );

  // Deduplicate SD/HD pairs — prefer HD, keep one per base name
  const seenBase = new Set<string>();
  const activeChannels = withPrograms
    .sort((a, b) => {
      const aHd = /\bhd\b/i.test(a.name) ? -1 : 1;
      const bHd = /\bhd\b/i.test(b.name) ? -1 : 1;
      return aHd - bHd;
    })
    .filter((ch) => {
      const base = ch.name.toLowerCase()
        .replace(/\.pl\b/g, "")
        .replace(/\b(hd|4k|sd)\b/g, "")
        .replace(/[^a-z0-9]/g, "");
      if (seenBase.has(base)) return false;
      seenBase.add(base);
      return true;
    });

  // Filtered channel set
  let filteredChannels = activeChannels.filter((ch) => !blacklist.has(ch.id));
  if (filter.trim()) {
    const q = filter.toLowerCase();
    filteredChannels = filteredChannels.filter((ch) =>
      ch.name.toLowerCase().includes(q),
    );
  }

  const channelIds = new Set(filteredChannels.map((ch) => ch.id));
  const channelById = new Map(activeChannels.map((ch) => [ch.id, ch]));

  // Films table: current + upcoming film programs from filtered channels, sorted by start time
  const filmRows = programs
    .filter(
      (p) =>
        channelIds.has(p.channel) &&
        isMovie(p.category) &&
        !isFilmBlockedChannel(channelById.get(p.channel)?.name ?? "") &&
        new Date(p.stop) > now,
    )
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter channels..."
          className="bg-gray-800/40 text-white text-sm pl-8 pr-3 py-1.5 rounded-lg border border-gray-700/50 focus:outline-none focus:border-indigo-500/50 placeholder-gray-600 w-44"
        />
      </div>

      <button
        onClick={() => setMoviesOnly((v) => !v)}
        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
          moviesOnly
            ? "bg-indigo-600 text-white"
            : "bg-gray-800/40 text-gray-400 hover:text-gray-200 border border-gray-700/50"
        }`}
      >
        Films
      </button>

      <button
        onClick={() => setTvView((v) => v === "config" ? "films" : "config")}
        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
          tvView === "config"
            ? "bg-gray-600 text-white"
            : "bg-gray-800/40 text-gray-400 hover:text-gray-200 border border-gray-700/50"
        }`}
      >
        Config
      </button>

      <span className="text-gray-600 text-xs ml-auto">
        {moviesOnly
          ? `${filmRows.length} film${filmRows.length !== 1 ? "s" : ""}`
          : `${filteredChannels.length} channel${filteredChannels.length !== 1 ? "s" : ""}`}
      </span>

      {data?.cachedAt && (
        <span className="text-gray-700 text-xs">
          {data.cached ? "cached" : "fetched"} {formatTime(data.cachedAt)}
        </span>
      )}

      <button
        onClick={() => load(true)}
        title="Refresh EPG cache"
        className="text-gray-600 hover:text-gray-300 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  );

  // Config view
  if (tvView === "config") {
    const blacklistedChannels = [...blacklist]
      .map((id) => channelById.get(id) ?? activeChannels.find((c) => c.id === id))
      .filter(Boolean) as EpgChannel[];

    return (
      <div>
        {toolbar}
        <div className="space-y-8 max-w-2xl">

          {/* EPG Source */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">EPG Source</h3>
            <div className="space-y-3">
              {/* Preset picker */}
              <div className="flex gap-2">
                <select
                  onChange={(e) => { if (e.target.value) setEpgUrlInput(e.target.value); e.target.value = ""; }}
                  defaultValue=""
                  className="bg-gray-800/40 text-gray-300 text-sm px-3 py-2 rounded-lg border border-gray-700/50 focus:outline-none flex-1"
                >
                  <option value="" disabled>Pick a preset country…</option>
                  {EPG_PRESETS.map((p) => (
                    <option key={p.url} value={p.url}>{p.label}</option>
                  ))}
                </select>
              </div>
              {/* URL input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={epgUrlInput}
                  onChange={(e) => setEpgUrlInput(e.target.value)}
                  placeholder={DEFAULT_EPG_URL}
                  className="flex-1 bg-gray-800/40 text-white text-sm px-3 py-2 rounded-lg border border-gray-700/50 focus:outline-none focus:border-indigo-500/50 placeholder-gray-600"
                />
                <button
                  onClick={saveEpgUrl}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
              {!epgUrlInput && (
                <p className="text-gray-700 text-xs">Using default: Poland</p>
              )}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 text-xs">Auto-refresh:</span>
                  <select
                    value={epgConfig?.epg_refresh_interval_hours ?? 0}
                    onChange={(e) => saveEpgInterval(Number(e.target.value))}
                    className="bg-gray-800/40 text-gray-300 text-xs px-2 py-1 rounded border border-gray-700/50 focus:outline-none"
                  >
                    <option value={0}>Off</option>
                    <option value={6}>Every 6h</option>
                    <option value={12}>Every 12h</option>
                    <option value={24}>Every 24h</option>
                  </select>
                </div>
                <button
                  onClick={triggerRefresh}
                  disabled={epgConfig?.epg_status === "running"}
                  className="px-3 py-1 rounded-lg text-xs bg-gray-700/50 text-gray-300 hover:bg-gray-600/50 disabled:opacity-50 transition-colors"
                >
                  {epgConfig?.epg_status === "running" ? "Refreshing…" : "Refresh now"}
                </button>
                {epgConfig?.epg_last_refresh && (
                  <span className="text-gray-700 text-xs">
                    Last: {formatTime(epgConfig.epg_last_refresh)}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Hidden Channels */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Hidden Channels {blacklist.size > 0 && <span className="text-gray-600 normal-case">({blacklist.size})</span>}
              </h3>
              {blacklist.size > 0 && (
                <button
                  onClick={clearBlacklist}
                  className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
            {blacklist.size === 0 ? (
              <p className="text-gray-700 text-sm">No channels hidden. Use × on any row to hide a channel.</p>
            ) : (
              <div className="space-y-1">
                {blacklistedChannels.map((ch) => (
                  <div key={ch.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800/30 border border-gray-700/30">
                    <div className="flex items-center gap-2">
                      {ch.icon && (
                        <img src={ch.icon} alt="" className="w-5 h-5 object-contain opacity-60 rounded"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      )}
                      <span className="text-gray-400 text-sm">{channelLabel(ch.name)}</span>
                    </div>
                    <button
                      onClick={() => unblacklistChannel(ch.id)}
                      className="text-xs text-gray-600 hover:text-gray-300 transition-colors px-2 py-0.5 rounded hover:bg-white/[0.05]"
                    >
                      Unhide
                    </button>
                  </div>
                ))}
                {/* channels that were blacklisted but not in current EPG */}
                {[...blacklist].filter((id) => !blacklistedChannels.find((c) => c.id === id)).map((id) => (
                  <div key={id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800/20 border border-gray-700/20">
                    <span className="text-gray-600 text-sm font-mono text-xs">{id}</span>
                    <button
                      onClick={() => unblacklistChannel(id)}
                      className="text-xs text-gray-600 hover:text-gray-300 transition-colors px-2 py-0.5 rounded hover:bg-white/[0.05]"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  // Films table view
  if (moviesOnly) {
    const nowFilms = filmRows.filter(
      (p) => new Date(p.start) <= now && new Date(p.stop) > now,
    );
    const upcomingFilms = filmRows.filter((p) => new Date(p.start) > now);

    const renderRow = (p: EpgProgram, isNow: boolean) => {
      const isSoon =
        !isNow &&
        new Date(p.start).getTime() - now.getTime() <= 30 * 60 * 1000;
      const ch = channelById.get(p.channel);
      const info = enrich[p.title];
      const rating = info?.rating ?? null;
      const year = info?.year ?? null;
      const progress = isNow
        ? Math.round(
            ((now.getTime() - new Date(p.start).getTime()) /
              (new Date(p.stop).getTime() - new Date(p.start).getTime())) *
              100,
          )
        : null;

      return (
        <div
          key={`${p.channel}-${p.start}`}
          className="grid grid-cols-[7rem_1fr_5rem_9rem_2rem] gap-x-4 items-center px-4 py-3.5 border-b border-gray-800/40 hover:bg-white/[0.02] transition-colors"
        >
          {/* Time */}
          <div className="tabular-nums shrink-0">
            {isNow ? (
              <div className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-lg bg-red-500/90 text-white w-fit leading-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/90 animate-pulse" />
                  ON NOW
                </span>
                <span className="text-gray-500 text-[11px] tabular-nums">
                  until {formatTime(p.stop)}
                </span>
                {progress !== null && (
                  <div className="h-0.5 w-16 rounded-full bg-gray-700 mt-0.5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gray-400/40"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                <span
                  className={`text-base font-semibold tabular-nums ${isSoon ? "text-amber-400" : "text-gray-200"}`}
                >
                  {formatTime(p.start)}
                </span>
                <span className="text-gray-600 text-[11px]">
                  {isSoon
                    ? relativeTime(p.start, now)
                    : `– ${formatTime(p.stop)}`}
                </span>
              </div>
            )}
          </div>

          {/* Film */}
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span
                className={`font-semibold text-[15px] leading-snug ${isNow ? "text-white" : "text-gray-100"}`}
              >
                {p.title}
              </span>
              {year && (
                <span className="text-gray-600 text-xs shrink-0">{year}</span>
              )}
            </div>
          </div>

          {/* Rating */}
          <div>
            {rating !== null && rating > 0 ? (
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg ${
                  rating >= 7
                    ? "bg-emerald-500/15 text-emerald-400"
                    : rating >= 5
                      ? "bg-yellow-500/15 text-yellow-400"
                      : "bg-gray-700/50 text-gray-500"
                }`}
              >
                ★ {rating.toFixed(1)}
              </span>
            ) : (
              <span className="text-gray-700 text-xs">—</span>
            )}
          </div>

          {/* Channel */}
          <div className="flex items-center gap-2 min-w-0">
            {ch?.icon && (
              <img
                src={ch.icon}
                alt=""
                className="w-5 h-5 object-contain rounded shrink-0 opacity-75"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <span className="text-gray-400 text-sm truncate">
              {channelLabel(ch?.name ?? p.channel)}
            </span>
          </div>

          {/* Blacklist */}
          <div className="flex justify-end">
            <button
              onClick={() => blacklistChannel(p.channel)}
              title={`Hide ${channelLabel(ch?.name ?? p.channel)}`}
              className="w-5 h-5 flex items-center justify-center rounded text-gray-700 hover:text-gray-400 hover:bg-white/[0.06] transition-colors"
            >
              ×
            </button>
          </div>
        </div>
      );
    };

    return (
      <div>
        {toolbar}
        {filmRows.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            No films scheduled today
          </div>
        ) : (
          <div>
            {/* Column headers */}
            <div className="grid grid-cols-[7rem_1fr_5rem_9rem_2rem] gap-x-4 px-4 pb-2 border-b border-gray-800/60">
              {["Time", "Film", "Rating", "Channel", ""].map((h) => (
                <span
                  key={h}
                  className="text-[11px] uppercase tracking-widest text-gray-600 font-medium"
                >
                  {h}
                </span>
              ))}
            </div>

            {nowFilms.map((p) => renderRow(p, true))}
            {upcomingFilms.map((p) => renderRow(p, false))}
          </div>
        )}
      </div>
    );
  }

  // Channel table view
  return (
    <div>
      {toolbar}
      {filteredChannels.length === 0 ? (
        <div className="text-center py-16 text-gray-600">No channels match</div>
      ) : (
        <div className="space-y-0">
          {/* Headers */}
          <div className="grid grid-cols-[10rem_1fr_14rem_2rem] gap-x-4 px-4 pb-2 border-b border-gray-800/60">
            {["Channel", "Now Playing", "Up Next", ""].map((h) => (
              <span key={h} className="text-[11px] uppercase tracking-widest text-gray-600 font-medium">
                {h}
              </span>
            ))}
          </div>

          {filteredChannels.map((ch) => {
            const current = getCurrentProgram(ch.id);
            const upcoming = getUpcoming(ch.id, 3);
            const currentIsMovie = isMovie(current?.category ?? null);
            const progress = current
              ? Math.round(
                  ((now.getTime() - new Date(current.start).getTime()) /
                    (new Date(current.stop).getTime() - new Date(current.start).getTime())) * 100,
                )
              : null;

            return (
              <div
                key={ch.id}
                className="grid grid-cols-[10rem_1fr_14rem_2rem] gap-x-4 items-start px-4 py-3 border-b border-gray-800/30 hover:bg-white/[0.02] transition-colors"
              >
                {/* Channel */}
                <div className="flex items-center gap-2 min-w-0 pt-0.5">
                  {ch.icon ? (
                    <img
                      src={ch.icon}
                      alt=""
                      className="w-5 h-5 object-contain rounded shrink-0 opacity-75"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="w-5 h-5 rounded bg-gray-700/60 shrink-0" />
                  )}
                  <span className="text-gray-300 text-sm truncate font-medium">
                    {channelLabel(ch.name)}
                  </span>
                </div>

                {/* Now Playing */}
                <div className="min-w-0">
                  {current ? (
                    <div>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className={`text-sm font-semibold leading-snug ${currentIsMovie ? "text-white" : "text-gray-300"}`}>
                          {current.title}
                        </span>
                        {currentIsMovie && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/25 text-indigo-300 leading-none shrink-0">
                            Film
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-gray-600 text-[11px] tabular-nums">
                          {formatTime(current.start)} – {formatTime(current.stop)}
                        </span>
                        {progress !== null && (
                          <div className="h-0.5 w-20 rounded-full bg-gray-700 overflow-hidden">
                            <div className="h-full rounded-full bg-gray-400/40" style={{ width: `${progress}%` }} />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-700 text-sm">—</span>
                  )}
                </div>

                {/* Up Next */}
                <div className="space-y-1">
                  {upcoming.slice(0, 3).map((p, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-gray-600 text-[11px] tabular-nums shrink-0 pt-px w-10">
                        {formatTime(p.start)}
                      </span>
                      <span className={`text-xs truncate ${isMovie(p.category) ? "text-indigo-400" : "text-gray-500"}`}>
                        {p.title}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Blacklist */}
                <div className="flex justify-end pt-0.5">
                  <button
                    onClick={() => blacklistChannel(ch.id)}
                    title={`Hide ${channelLabel(ch.name)}`}
                    className="w-5 h-5 flex items-center justify-center rounded text-gray-700 hover:text-gray-400 hover:bg-white/[0.06] transition-colors"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
