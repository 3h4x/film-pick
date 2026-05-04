"use client";
import MovieCard from "@/components/MovieCard";
import RecommendationRow from "@/components/RecommendationRow";
import RecommendationSkeleton from "@/components/RecommendationSkeleton";
import type { RecommendationGroup } from "@/lib/types";
import { REC_CATEGORIES } from "@/lib/types";
import type { TmdbSearchResult } from "@/lib/tmdb";
import { MOOD_PRESETS, MOOD_KEYS, type MoodKey } from "@/lib/mood-presets";
import type { useRecommendations } from "@/lib/hooks/useRecommendations";

type RecsState = ReturnType<typeof useRecommendations>;

function formatRefreshTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `yesterday at ${date.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface RecommendationsViewProps {
  recs: RecsState;
  hasMovies: boolean;
  disabledEngines: string[];
  invalidMoodKey: string | null;
  clearInvalidMood: () => void;
}

export default function RecommendationsView({
  recs,
  hasMovies,
  disabledEngines,
  invalidMoodKey,
  clearInvalidMood,
}: RecommendationsViewProps) {
  const {
    recsLoading,
    recommendations,
    moodGroups,
    moodLoading,
    moodError,
    recCategory,
    activeMood,
    groupOrder,
    setGroupOrder,
    categoryCounts,
    lastRecsRefresh,
    engineDropdownOpen,
    setEngineDropdownOpen,
    moodDropdownOpen,
    setMoodDropdownOpen,
    setRecCategory,
    setActiveMood,
    refreshRecs,
    handleRecAction,
    handleRecClick,
  } = recs;

  if (!hasMovies) {
    return (
      <div className="text-center py-24">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-800/50 flex items-center justify-center">
          <span className="text-4xl">💡</span>
        </div>
        <p className="text-gray-400 text-lg font-medium">
          No recommendations yet
        </p>
        <p className="text-gray-600 text-sm mt-2">
          Add some movies to your library first
        </p>
      </div>
    );
  }

  function recActionButtons(r: TmdbSearchResult, fromMood = false) {
    return (
      <div className="absolute right-1 bottom-14 z-10 flex flex-col gap-1 opacity-100 transition-all duration-200 md:[@media(hover:hover)]:opacity-0 md:[@media(hover:hover)]:group-hover/rec:opacity-100">
        <button onClick={() => handleRecAction(r.tmdb_id, "liked", r, fromMood)} className="bg-green-600/90 backdrop-blur-sm text-white rounded-lg w-9 h-9 text-sm flex items-center justify-center hover:bg-green-500 transition-colors" title="Watched &amp; liked">👍</button>
        <button onClick={() => handleRecAction(r.tmdb_id, "watched", r, fromMood)} className="bg-gray-600/90 backdrop-blur-sm text-white rounded-lg w-9 h-9 text-sm flex items-center justify-center hover:bg-gray-500 transition-colors" title="Watched">👁</button>
        <button onClick={() => handleRecAction(r.tmdb_id, "wishlist", r, fromMood)} className="bg-blue-600/90 backdrop-blur-sm text-white rounded-lg w-9 h-9 text-sm flex items-center justify-center hover:bg-blue-500 transition-colors" title="Add to watchlist">🔖</button>
        <button onClick={() => handleRecAction(r.tmdb_id, "disliked", r, fromMood)} className="bg-orange-600/90 backdrop-blur-sm text-white rounded-lg w-9 h-9 text-sm flex items-center justify-center hover:bg-orange-500 transition-colors" title="Watched &amp; disliked">👎</button>
        <button onClick={() => handleRecAction(r.tmdb_id, "dismiss", r, fromMood)} className="bg-red-600/90 backdrop-blur-sm text-white rounded-lg w-9 h-9 text-sm flex items-center justify-center hover:bg-red-500 transition-colors" title="Don't show again">✕</button>
      </div>
    );
  }

  const moodPicks = (() => {
    const seen = new Set<number>();
    return moodGroups
      .flatMap((g) => g.recommendations)
      .filter((r) => { if (seen.has(r.tmdb_id)) return false; seen.add(r.tmdb_id); return true; });
  })();

  return (
    <>
      {(engineDropdownOpen || moodDropdownOpen) && (
        <div className="fixed inset-0 z-40" onClick={() => { setEngineDropdownOpen(false); setMoodDropdownOpen(false); }} />
      )}

      {/* Filter row */}
      <div className="flex items-center gap-2 relative z-50">
        {/* Engine dropdown */}
        <div className="relative">
          <button
            onClick={() => { setEngineDropdownOpen(!engineDropdownOpen); setMoodDropdownOpen(false); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${!activeMood ? "bg-gray-700/80 border-gray-600 text-white" : "bg-gray-800/60 border-gray-700/50 text-gray-400 hover:text-gray-200 hover:border-gray-600"}`}
          >
            <span>{activeMood ? "Engine" : (REC_CATEGORIES.find((c) => c.value === recCategory)?.label ?? "All")}</span>
            {!activeMood && categoryCounts[recCategory] != null && (
              <span className="tabular-nums text-gray-400">{categoryCounts[recCategory]}</span>
            )}
            <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {engineDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 py-1 min-w-[180px]">
              {REC_CATEGORIES.filter((cat) => cat.value === "all" || !disabledEngines.includes(cat.value)).map((cat) => (
                <button key={cat.value} onClick={() => { clearInvalidMood(); setRecCategory(cat.value); setActiveMood(null); setEngineDropdownOpen(false); }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium transition-all ${!activeMood && recCategory === cat.value ? "text-white bg-gray-700/60" : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/30"}`}>
                  <span>{cat.label}</span>
                  {categoryCounts[cat.value] != null && <span className="tabular-nums text-gray-600 ml-3">{categoryCounts[cat.value]}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mood dropdown */}
        <div className="relative">
          <button
            onClick={() => { setMoodDropdownOpen(!moodDropdownOpen); setEngineDropdownOpen(false); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${activeMood ? "bg-indigo-600/80 border-indigo-500/60 text-white" : "bg-gray-800/60 border-gray-700/50 text-gray-400 hover:text-gray-200 hover:border-gray-600"}`}
          >
            {activeMood ? (<><span>{MOOD_PRESETS[activeMood].icon}</span><span>{MOOD_PRESETS[activeMood].label}</span></>) : <span>Mood</span>}
            <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {moodDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 py-1 min-w-[180px]">
              {activeMood && (
                <>
                  <button onClick={() => { clearInvalidMood(); setActiveMood(null); setMoodDropdownOpen(false); }} className="w-full flex items-center px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-200 hover:bg-gray-700/30 transition-all">Clear mood</button>
                  <div className="h-px bg-gray-700/60 mx-2 my-1" />
                </>
              )}
              {MOOD_KEYS.map((key) => {
                const preset = MOOD_PRESETS[key];
                return (
                  <button key={key} onClick={() => { clearInvalidMood(); setActiveMood(key); setMoodDropdownOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-all ${activeMood === key ? "text-white bg-indigo-600/40" : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/30"}`}>
                    <span>{preset.icon}</span>
                    <span>{preset.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {lastRecsRefresh && (
            <span className="text-gray-600 text-xs hidden sm:inline">refreshed {formatRefreshTime(lastRecsRefresh)}</span>
          )}
          <button onClick={refreshRecs} className="text-gray-500 hover:text-white p-2 rounded-lg hover:bg-gray-800/60 transition-all" title="Refresh recommendations">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      {invalidMoodKey ? (
        <div className="text-center py-24">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-800/50 flex items-center justify-center">
            <span className="text-4xl">🧭</span>
          </div>
          <p className="text-gray-400 text-lg font-medium">Unknown mood preset</p>
          <p className="text-gray-600 text-sm mt-2">
            <span className="text-gray-500">{`"${invalidMoodKey}" isn't available in this build.`}</span>{" "}
            Choose one from the Mood menu.
          </p>
        </div>
      ) : activeMood ? (
        moodLoading ? (
          <RecommendationSkeleton />
        ) : moodError ? (
          <div className="text-center py-24">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-800/50 flex items-center justify-center"><span className="text-4xl">⚠️</span></div>
            <p className="text-gray-400 text-lg font-medium">Failed to load mood picks</p>
            <p className="text-gray-600 text-sm mt-2">{moodError}</p>
          </div>
        ) : moodGroups.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-800/50 flex items-center justify-center"><span className="text-4xl">{MOOD_PRESETS[activeMood].icon}</span></div>
            <p className="text-gray-400 text-lg font-medium">No results for this mood</p>
            <p className="text-gray-600 text-sm mt-2">Try adding more movies or select a different mood</p>
          </div>
        ) : (
          <div>
            <p className="text-gray-500 text-xs mb-3">{MOOD_PRESETS[activeMood].reason} — {moodPicks.length} {moodPicks.length === 1 ? "pick" : "picks"}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {moodPicks.map((r) => (
                <div key={r.tmdb_id} className="relative group/rec">
                  <MovieCard title={r.title} year={r.year} genre={r.genre} rating={r.rating} userRating={null} posterUrl={r.poster_url} source="tmdb" cdaUrl={r.cda_url} onClick={() => handleRecClick(r)} />
                  {recActionButtons(r, true)}
                </div>
              ))}
            </div>
          </div>
        )
      ) : recsLoading ? (
        <RecommendationSkeleton />
      ) : recommendations.length === 0 ? (
        <div className="text-center py-24">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-800/50 flex items-center justify-center"><span className="text-4xl">🔍</span></div>
          <p className="text-gray-400 text-lg font-medium">No recommendations found</p>
          <p className="text-gray-600 text-sm mt-2">Try adding more movies to improve suggestions</p>
        </div>
      ) : recCategory === "all" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {(() => { const seen = new Set<number>(); return recommendations.flatMap((g) => g.recommendations).filter((r) => { if (seen.has(r.tmdb_id)) return false; seen.add(r.tmdb_id); return true; }); })().map((r) => (
            <div key={r.tmdb_id} className="relative group/rec">
              <MovieCard title={r.title} year={r.year} genre={r.genre} rating={r.rating} userRating={null} posterUrl={r.poster_url} source="tmdb" cdaUrl={r.cda_url} onClick={() => handleRecClick(r)} />
              {recActionButtons(r)}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {(() => {
            const filtered = recommendations.filter((g) => g.type === recCategory);
            const sorted = [...filtered].sort((a, b) => {
              const ai = groupOrder.indexOf(a.reason);
              const bi = groupOrder.indexOf(b.reason);
              if (ai === -1 && bi === -1) return 0;
              if (ai === -1) return 1;
              if (bi === -1) return -1;
              return ai - bi;
            });
            return sorted.map((group, i) => (
              <RecommendationRow
                key={group.reason}
                reason={group.reason}
                type={group.type}
                recommendations={group.recommendations}
                onAction={handleRecAction}
                isFirst={i === 0}
                isLast={i === sorted.length - 1}
                onMoveUp={() => {
                  const order = sorted.map((g) => g.reason);
                  const idx = order.indexOf(group.reason);
                  if (idx > 0) [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
                  setGroupOrder(order);
                  fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rec_group_order: order }) });
                }}
                onMoveDown={() => {
                  const order = sorted.map((g) => g.reason);
                  const idx = order.indexOf(group.reason);
                  if (idx < order.length - 1) [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
                  setGroupOrder(order);
                  fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rec_group_order: order }) });
                }}
                onClickMovie={handleRecClick}
              />
            ));
          })()}
        </div>
      )}
    </>
  );
}
