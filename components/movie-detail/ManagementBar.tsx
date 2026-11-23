"use client";

import Button from "@/components/ui/Button";

interface ManagementBarProps {
  canPlay: boolean;
  isPersistedMovie: boolean;
  isMenuOpen: boolean;
  onPlay: () => void;
  onToggleMenu: () => void;
  onClose: () => void;
}

export default function ManagementBar({
  canPlay,
  isPersistedMovie,
  isMenuOpen,
  onPlay,
  onToggleMenu,
  onClose,
}: ManagementBarProps) {
  return (
    <div className="shrink-0 flex items-center justify-end gap-2 px-3 sm:px-6 pt-3 pb-3">
      {canPlay && (
        <Button onClick={onPlay} className="min-h-11 rounded-xl px-3 text-sm">
          <span aria-hidden="true">▶</span> Play in browser
        </Button>
      )}
      {isPersistedMovie && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleMenu();
          }}
          className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
            isMenuOpen
              ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
              : "bg-gray-800/80 text-gray-500 hover:text-white hover:bg-gray-800"
          }`}
          title="Management Menu"
          aria-label={isMenuOpen ? "Close management menu" : "Open management menu"}
        >
          <span className="text-xl">⋮</span>
        </button>
      )}
      <button
        onClick={onClose}
        className="w-11 h-11 bg-gray-800/80 hover:bg-gray-800 text-gray-500 hover:text-white rounded-xl flex items-center justify-center transition-all text-xl"
        title="Close"
        aria-label="Close"
      >
        ✕
      </button>
    </div>
  );
}
