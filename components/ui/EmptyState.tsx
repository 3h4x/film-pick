import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: string;
  message: string;
  subtext?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export default function EmptyState({
  icon,
  message,
  subtext,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={["text-center py-24", className].filter(Boolean).join(" ")}
    >
      {icon && (
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-800/50 flex items-center justify-center">
          <span className="text-4xl">{icon}</span>
        </div>
      )}
      <p className="text-gray-400 text-lg font-medium">{message}</p>
      {subtext && (
        <p className="text-gray-600 text-sm mt-2">{subtext}</p>
      )}
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
