"use client";

interface NotInterestedButtonProps {
  dismissed: boolean;
  isSaving: boolean;
  onToggle: () => void;
}

/** "Not interested": the recommendation dismissal, toggled from the detail. */
export default function NotInterestedButton({ dismissed, isSaving, onToggle }: NotInterestedButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isSaving}
      aria-pressed={dismissed}
      title={
        dismissed
          ? "Marked not interested: not recommended again, flagged in tpb. Click to undo"
          : "Not interested: never recommend it, flag it in tpb"
      }
      className={`flex min-h-11 items-center gap-1.5 rounded-xl border px-3 py-0.5 text-sm font-bold transition-colors sm:min-h-9 ${
        isSaving ? "cursor-wait opacity-60" : ""
      } ${
        dismissed
          ? "border-red-400/40 bg-red-500/15 text-red-200 hover:bg-red-500/25"
          : "border-gray-700 bg-gray-800/70 text-gray-400 hover:border-red-400/50 hover:text-red-200"
      }`}
    >
      🚫 {dismissed ? "Not interested ✓" : "Not interested"}
    </button>
  );
}
