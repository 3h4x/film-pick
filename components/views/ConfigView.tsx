"use client";
import ConfigPanel from "@/components/ConfigPanel";
import type { RecConfig, RecommendationGroup } from "@/lib/types";
import { REC_CATEGORIES } from "@/lib/types";

interface ConfigViewProps {
  recConfig: RecConfig;
  setRecConfig: (cfg: RecConfig) => void;
  tmdbKeySource: "env" | "db" | null;
  disabledEngines: string[];
  setDisabledEngines: (engines: string[]) => void;
  libraryPath: string | null;
  setLibraryPath: (path: string | null) => void;
  setSyncOpen: (open: boolean) => void;
  addToast: (message: string, variant?: "default" | "success") => void;
  fetchEngine: (engine: string, refresh?: boolean) => Promise<void>;
  setRecGroups: React.Dispatch<
    React.SetStateAction<Record<string, RecommendationGroup[]>>
  >;
}

export default function ConfigView({
  recConfig,
  setRecConfig,
  tmdbKeySource,
  disabledEngines,
  setDisabledEngines,
  libraryPath,
  setLibraryPath,
  setSyncOpen,
  addToast,
  fetchEngine,
  setRecGroups,
}: ConfigViewProps) {
  async function handleSaveLibraryPath(path: string) {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ library_path: path }),
    });
    if (res.ok) {
      setLibraryPath(path || null);
    } else {
      const data = await res.json().catch(() => ({}));
      addToast(data.error || "Failed to save library path");
    }
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
    REC_CATEGORIES.slice(1)
      .filter((c) => !disabledEngines.includes(c.value))
      .forEach((c) => fetchEngine(c.value, true));
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
      engines={REC_CATEGORIES.slice(1)}
      libraryPath={libraryPath}
      onSaveLibraryPath={handleSaveLibraryPath}
      onSync={() => setSyncOpen(true)}
      onSave={handleSaveConfig}
      onToggleEngine={handleToggleEngine}
    />
  );
}
