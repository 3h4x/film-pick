/** The last subtitle lookup for a movie, as stored on its row and shown in the detail. */
export interface SubtitleCheck {
  /** Unix seconds. */
  at: number;
  status: string;
  /** Providers for downloaded/not_found ("napiprojekt,opensubtitles"), the message for an error. */
  detail: string | null;
}

const PROVIDER_NAMES: Record<string, string> = {
  napiprojekt: "NapiProjekt",
  opensubtitles: "OpenSubtitles",
};

export function subtitleCheckFromRow(row: {
  subtitles_checked_at?: number | null;
  subtitles_check_status?: string | null;
  subtitles_check_detail?: string | null;
}): SubtitleCheck | null {
  if (!row.subtitles_checked_at || !row.subtitles_check_status) return null;
  return {
    at: row.subtitles_checked_at,
    status: row.subtitles_check_status,
    detail: row.subtitles_check_detail ?? null,
  };
}

function formatCheckDate(at: number): string {
  return new Date(at * 1000).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function providerList(detail: string | null): string {
  const names = (detail ?? "")
    .split(",")
    .map((p) => PROVIDER_NAMES[p.split(":")[0]] ?? p)
    .filter(Boolean);
  return names.length > 0 ? names.join(" or ") : "NapiProjekt";
}

/**
 * One line for the movie detail: when subtitles were last looked for and what came
 * of it, so "nothing here" reads as "tried, none exist yet" rather than "never tried".
 */
export function describeSubtitleCheck(check: SubtitleCheck | null, notFoundRetryDays = 7): string {
  if (!check) return "Not looked up yet; the background job will search for Polish subtitles.";
  const when = formatCheckDate(check.at);
  switch (check.status) {
    case "downloaded": {
      const [provider, how] = (check.detail ?? "").split(":");
      return `Downloaded from ${PROVIDER_NAMES[provider] ?? provider} on ${when}${
        how === "title" ? " (matched by title, timing may be off)" : ""
      }.`;
    }
    case "not_found":
      return `Last checked ${when}: no Polish subtitles on ${providerList(check.detail)} yet. Checked again automatically every ${notFoundRetryDays} days.`;
    case "exists":
      return `Last checked ${when}: subtitles were already there.`;
    case "no_file":
      return `Last try ${when}: the video file was not reachable. Tried again tomorrow.`;
    case "error":
      return `Last try ${when} failed${check.detail ? `: ${check.detail}` : ""}. Tried again tomorrow.`;
    default:
      return `Last checked ${when}.`;
  }
}
