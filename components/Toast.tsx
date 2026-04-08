"use client";

import { useEffect } from "react";

interface ToastProps {
  id: number;
  message: string;
  onDismiss: (id: number) => void;
}

export default function Toast({ id, message, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), 3000);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  return (
    <div className="bg-gray-800 border border-gray-700/50 text-gray-200 text-sm px-4 py-3 rounded-xl shadow-lg backdrop-blur-sm animate-[slideUp_200ms_ease-out]">
      {message}
    </div>
  );
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: { id: number; message: string }[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <Toast key={t.id} id={t.id} message={t.message} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
