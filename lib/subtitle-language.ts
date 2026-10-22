export type SubtitleLanguage = "en" | "pl";

export const SUBTITLE_LANGUAGE_LABELS = { en: "English", pl: "Polish" } as const;
export const DEFAULT_SUBTITLE_LANGUAGE: SubtitleLanguage = "en";

export function isSubtitleLanguage(value: unknown): value is SubtitleLanguage {
  return value === "en" || value === "pl";
}

export function subtitleTrackLanguage(name: string): SubtitleLanguage | undefined {
  const match = name.match(/\.(en|pl)\.[^.]+$/i);
  return match ? match[1].toLowerCase() as SubtitleLanguage : undefined;
}
