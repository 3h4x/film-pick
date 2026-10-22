"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SUBTITLE_LANGUAGE, isSubtitleLanguage, type SubtitleLanguage } from "@/lib/subtitle-language";
import { getErrorMessage } from "@/lib/utils";

export function useSubtitleLanguage() {
  const [language, setLanguage] = useState<SubtitleLanguage>(DEFAULT_SUBTITLE_LANGUAGE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/settings", { signal: controller.signal });
        if (!response.ok) throw new Error("Could not load subtitle language");
        const settings = await response.json();
        if (isSubtitleLanguage(settings.subtitle_language)) setLanguage(settings.subtitle_language);
      } catch (error) {
        if (!controller.signal.aborted) setError(getErrorMessage(error));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  async function saveLanguage(next: SubtitleLanguage) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtitle_language: next }),
      });
      if (!response.ok) throw new Error("Could not save subtitle language");
      setLanguage(next);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }
  return { language, setLanguage, saveLanguage, loading, saving, error };
}
