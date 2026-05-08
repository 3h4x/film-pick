"use client";

import { useState } from "react";

interface CardActionItem {
  key: string;
  label: string;
  icon: string;
  className: string;
  onClick: () => void;
}

interface CardActionStackProps {
  actions: CardActionItem[];
}

export default function CardActionStack({ actions }: CardActionStackProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  function runAction(action: CardActionItem) {
    action.onClick();
    setMobileOpen(false);
  }

  return (
    <div className="absolute right-1 bottom-14 z-10">
      <div className="hidden flex-col gap-1 opacity-0 transition-all duration-200 [@media(hover:hover)]:flex [@media(hover:hover)]:group-hover/rec:opacity-100 [@media(hover:hover)]:group-hover/wish:opacity-100">
        {actions.map((action) => (
          <button
            key={action.key}
            onClick={(e) => {
              e.stopPropagation();
              runAction(action);
            }}
            className={action.className}
            title={action.label}
            aria-label={action.label}
          >
            {action.icon}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-end gap-1 [@media(hover:hover)]:hidden">
        {mobileOpen && (
          <div className="mb-1 flex flex-col gap-1 rounded-xl border border-gray-700/60 bg-gray-950/80 p-1 shadow-2xl backdrop-blur-md">
            {actions.map((action) => (
              <button
                key={action.key}
                onClick={(e) => {
                  e.stopPropagation();
                  runAction(action);
                }}
                className={action.className}
                title={action.label}
                aria-label={action.label}
              >
                {action.icon}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMobileOpen((open) => !open);
          }}
          className="flex h-11 w-11 items-center justify-center rounded-lg bg-black/70 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/80 sm:h-9 sm:w-9"
          title={mobileOpen ? "Hide actions" : "Show actions"}
          aria-label={mobileOpen ? "Hide actions" : "Show actions"}
        >
          {mobileOpen ? "✕" : "⋯"}
        </button>
      </div>
    </div>
  );
}
