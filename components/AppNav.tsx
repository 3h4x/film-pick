"use client";
import { useRouter } from "next/navigation";
import type { AppTab } from "@/lib/types";

interface AppNavProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  initialLoad: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  moviesCount: number;
  wishlistCount: number;
  totalRecsCount: number;
  categoryCounts: Record<string, number>;
  epgEnabled: boolean;
  libraryPath: string | null;
  onSync: () => void;
  onImport: () => void;
  onSearchEnter: (query: string) => Promise<void>;
}

export default function AppNav({
  activeTab,
  setActiveTab,
  initialLoad,
  searchQuery,
  setSearchQuery,
  moviesCount,
  wishlistCount,
  totalRecsCount,
  categoryCounts,
  epgEnabled,
  libraryPath,
  onSync,
  onImport,
  onSearchEnter,
}: AppNavProps) {
  const router = useRouter();

  const tabs = [
    {
      key: "recommendations" as const,
      label: "Discover",
      count:
        categoryCounts["all"] > 0 ? categoryCounts["all"] : totalRecsCount,
    },
    {
      key: "library" as const,
      label: "Library",
      count: initialLoad ? -1 : moviesCount,
    },
    {
      key: "wishlist" as const,
      label: "Watchlist",
      count: initialLoad ? -1 : wishlistCount,
    },
    ...(epgEnabled ? [{ key: "tv" as const, label: "TV", count: -1 }] : []),
    { key: "config" as const, label: "Config", count: -1 },
  ];

  return (
    <nav className="sticky top-0 z-40 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 pb-0 bg-[#0a0e1a]/90 backdrop-blur-2xl border-b border-white/[0.05] shadow-[0_1px_0_0_rgba(255,255,255,0.03)]">
      <div className="max-w-7xl mx-auto">
        {/* Row 1: Logo + Actions */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <h1
              className="text-lg font-bold text-white tracking-tight flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => router.push("/")}
            >
              <img
                src="/icon-192.png"
                alt="FilmPick"
                className="w-7 h-7 rounded-lg"
              />
              <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                FilmPick
              </span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-400/80 border border-indigo-500/20">
                {process.env.NEXT_PUBLIC_APP_VERSION || "dev"}
              </span>
            </h1>
            {!initialLoad && (
              <div className="relative group flex-1 max-w-[200px] sm:max-w-xs transition-all">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <svg
                    className="w-3.5 h-3.5 text-gray-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && searchQuery.trim()) {
                      setActiveTab("search");
                      await onSearchEnter(searchQuery);
                    }
                    if (e.key === "Escape") {
                      setSearchQuery("");
                      setActiveTab("library");
                    }
                  }}
                  placeholder="Search library..."
                  className="w-full bg-gray-800/40 text-white text-xs pl-8 pr-8 py-1.5 rounded-lg border border-gray-700/50 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 focus:outline-none placeholder-gray-600 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      if (activeTab === "search") setActiveTab("library");
                    }}
                    className="absolute inset-y-0 right-2 flex items-center px-1 text-gray-500 hover:text-white"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
          {!initialLoad && (
            <div className="flex items-center gap-2">
              {activeTab === "library" && libraryPath && (
                <button
                  onClick={onSync}
                  className="text-gray-500 hover:text-white p-2 rounded-lg hover:bg-gray-800/60 transition-all"
                  title="Sync library"
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
                </button>
              )}
              {activeTab === "library" && (
                <button
                  onClick={onImport}
                  className="text-gray-500 hover:text-white p-2 rounded-lg hover:bg-gray-800/60 transition-all"
                  title="Import folder"
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
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Row 2: Tabs */}
        <div className="flex gap-0.5">
          {tabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative px-3.5 py-2 pb-2.5 text-sm font-medium transition-all ${
                  active
                    ? "text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {tab.label}
                {tab.count >= 0 && (
                  <span
                    className={`ml-1.5 text-[11px] tabular-nums ${
                      active ? "text-indigo-400" : "text-gray-600"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
                {active && (
                  <div className="absolute bottom-0 left-1 right-1 h-[2px] bg-gradient-to-r from-indigo-500/60 via-indigo-500 to-indigo-500/60 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
