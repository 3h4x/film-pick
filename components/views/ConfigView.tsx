"use client";
// tamtam inspected 2026-05-21
import ConfigPanel from "@/components/ConfigPanel";
import type { RecConfig, RecommendationGroup } from "@/lib/types";
import { REC_CATEGORIES } from "@/lib/types";

const REC_ENGINE_CATEGORIES = REC_CATEGORIES.slice(1);

interface ConfigViewProps {
  recConfig: RecConfig;
  setRecConfig: (cfg: RecConfig) => void;
  tmdbKeySource: "env" | "db" | null;
  disabledEngines: string[];
  setDisabledEngines: (engines: string[]) => void;
  libraryPath: string | null;
  libraryExtraPaths: string[];
  setLibraryPath: (path: string | null) => void;
  setLibraryExtraPaths: (paths: string[]) => void;
  setSyncOpen: (open: boolean) => void;
  addToast: (message: string, variant?: "default" | "success") => void;
  fetchEngine: (engine: string, refresh?: boolean) => Promise<void>;
  setRecGroups: React.Dispatch<
    React.SetStateAction<Record<string, RecommendationGroup[]>>
  >;
  onOpenMovie: (id: number) => void;
}

export default function ConfigView({
  recConfig,
  setRecConfig,
  tmdbKeySource,
  disabledEngines,
  setDisabledEngines,
  libraryPath,
  libraryExtraPaths,
  setLibraryPath,
  setLibraryExtraPaths,
  setSyncOpen,
  addToast,
  fetchEngine,
  setRecGroups,
  onOpenMovie,
}: ConfigViewProps) {
  async function handleSaveFolders(
    primary: string | null,
    extras: string[],
  ): Promise<boolean> {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        library_path: primary ?? "",
        library_extra_paths: extras,
      }),
    });
    if (res.ok) {
      // Re-read so the UI shows what the server normalised (dedupe, promoted primary).
      const settings = await fetch("/api/settings")
        .then((r) => r.json())
        .catch(() => null);
      setLibraryPath(settings ? settings.library_path : primary);
      setLibraryExtraPaths(settings?.library_extra_paths ?? extras);
      return true;
    }
    const data = await res.json().catch(() => ({}));
    addToast(data.error || "Failed to save library folders");
    return false;
  }

  async function handleSaveConfig(cfg: RecConfig) {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rec_config: cfg }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      addToast(data.error || "Failed to save config");
      return;
    }
    setRecConfig(cfg);
    addToast("Config saved — refreshing recommendations");
    setRecGroups({});
    for (const c of REC_ENGINE_CATEGORIES) {
      if (!disabledEngines.includes(c.value)) fetchEngine(c.value, true);
    }
  }

  async function handleToggleEngine(engineKey: string) {
    const updated = disabledEngines.includes(engineKey)
      ? disabledEngines.filter((e) => e !== engineKey)
      : [...disabledEngines, engineKey];
    setDisabledEngines(updated);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled_engines: updated }),
    });
    if (!updated.includes(engineKey)) {
      fetchEngine(engineKey, true);
    } else {
      setRecGroups((prev) => {
        const next = { ...prev };
        delete next[engineKey];
        return next;
      });
    }
  }

  return (
    <ConfigPanel
      config={recConfig}
      tmdbKeySource={tmdbKeySource}
      disabledEngines={disabledEngines}
      engines={REC_ENGINE_CATEGORIES}
      libraryPath={libraryPath}
      libraryExtraPaths={libraryExtraPaths}
      onSaveFolders={handleSaveFolders}
      onSync={() => setSyncOpen(true)}
      onSave={handleSaveConfig}
      onToggleEngine={handleToggleEngine}
      onOpenMovie={onOpenMovie}
      addToast={addToast}
    />
  );
}
