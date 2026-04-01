"use client";

type AppTab = "library" | "recommendations" | "wishlist";

interface TabNavProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  libraryCount: number;
  wishlistCount: number;
  recsCount: number;
}

export default function TabNav({ activeTab, onTabChange, libraryCount, wishlistCount, recsCount }: TabNavProps) {
  const tabClass = (active: boolean) =>
    `flex-1 py-2.5 text-sm font-medium rounded-lg transition-all text-center ${
      active
        ? "bg-gray-700/80 text-white shadow-sm"
        : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/30"
    }`;

  const badge = (count: number, active: boolean) =>
    count >= 0 ? (
      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-md ${
        active ? "bg-indigo-500/20 text-indigo-300" : "bg-gray-700/50 text-gray-500"
      }`}>
        {count}
      </span>
    ) : null;

  return (
    <div className="flex gap-1 bg-gray-800/40 p-1 rounded-xl w-full max-w-lg">
      <button className={tabClass(activeTab === "library")} onClick={() => onTabChange("library")}>
        Library{badge(libraryCount, activeTab === "library")}
      </button>
      <button className={tabClass(activeTab === "wishlist")} onClick={() => onTabChange("wishlist")}>
        Watchlist{badge(wishlistCount, activeTab === "wishlist")}
      </button>
      <button className={tabClass(activeTab === "recommendations")} onClick={() => onTabChange("recommendations")}>
        Recommendations{badge(recsCount, activeTab === "recommendations")}
      </button>
    </div>
  );
}
