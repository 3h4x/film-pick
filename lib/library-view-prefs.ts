import type { SortOption } from "@/lib/types";

// The Library tab's last sort and filters, remembered per browser so the view is
// the same the next time it is opened. Search text is deliberately not saved.
const STORAGE_KEY = "filmpick.library.view.v1";

const SORT_OPTIONS: readonly SortOption[] = [
  "user_rating",
  "rating",
  "year",
  "title",
  "created_at",
  "rated_at",
];

export interface LibraryViewPrefs {
  sort: SortOption;
  sortDir: "asc" | "desc";
  genreFilter: string;
  sourceFilter: string;
  yearFilter: string;
  unratedOnly: boolean;
  hasFileOnly: boolean;
}

export const DEFAULT_LIBRARY_VIEW: LibraryViewPrefs = {
  sort: "created_at",
  sortDir: "desc",
  genreFilter: "",
  sourceFilter: "",
  yearFilter: "",
  unratedOnly: false,
  hasFileOnly: false,
};

/** Keep only the fields that hold a valid value; anything else falls back to the default. */
export function parseLibraryViewPrefs(raw: string | null): Partial<LibraryViewPrefs> {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof data !== "object" || data === null) return {};
  const d = data as Record<string, unknown>;
  const prefs: Partial<LibraryViewPrefs> = {};
  if (SORT_OPTIONS.includes(d.sort as SortOption)) prefs.sort = d.sort as SortOption;
  if (d.sortDir === "asc" || d.sortDir === "desc") prefs.sortDir = d.sortDir;
  for (const key of ["genreFilter", "sourceFilter", "yearFilter"] as const) {
    if (typeof d[key] === "string") prefs[key] = d[key];
  }
  for (const key of ["unratedOnly", "hasFileOnly"] as const) {
    if (typeof d[key] === "boolean") prefs[key] = d[key];
  }
  return prefs;
}

// Storage can be missing or throw (private windows, blocked site data), and the
// view must work without it.
export function readLibraryViewPrefs(): Partial<LibraryViewPrefs> {
  try {
    return parseLibraryViewPrefs(localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

export function writeLibraryViewPrefs(prefs: LibraryViewPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}
