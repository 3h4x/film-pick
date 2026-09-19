import path from "path";
import type Database from "better-sqlite3";
import { getSetting, setSetting } from "@/lib/db";

// The primary folder keeps living in the legacy `library_path` setting so every
// reader of that key (standardize, delete, the detail view) keeps working. Any
// additional folders are a JSON array in `library_extra_paths`.
const PRIMARY_KEY = "library_path";
const EXTRAS_KEY = "library_extra_paths";

export interface LibraryFolders {
  primary: string | null;
  extras: string[];
}

function sameFolder(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

function parseExtras(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === "string" && p.trim() !== "");
  } catch {
    return [];
  }
}

/** Trim, drop empties and duplicates, and keep the primary out of the extras. */
export function normalizeFolders(
  primary: string | null,
  extras: string[],
): LibraryFolders {
  const cleanPrimary = primary?.trim() || null;
  const seen: string[] = cleanPrimary ? [cleanPrimary] : [];
  const cleanExtras: string[] = [];
  for (const raw of extras) {
    const value = raw.trim();
    if (!value || seen.some((s) => sameFolder(s, value))) continue;
    seen.push(value);
    cleanExtras.push(value);
  }
  return { primary: cleanPrimary, extras: cleanExtras };
}

export function getLibraryFolders(db: Database.Database): LibraryFolders {
  return normalizeFolders(
    getSetting(db, PRIMARY_KEY),
    parseExtras(getSetting(db, EXTRAS_KEY)),
  );
}

/** Every configured root, primary first. */
export function getLibraryRoots(db: Database.Database): string[] {
  const { primary, extras } = getLibraryFolders(db);
  return primary ? [primary, ...extras] : extras;
}

export function saveLibraryFolders(
  db: Database.Database,
  next: LibraryFolders,
): LibraryFolders {
  let { primary, extras } = normalizeFolders(next.primary, next.extras);
  // Without a primary the first extra takes over, so there is always a target
  // for standardize as long as any folder is configured.
  if (!primary && extras.length > 0) {
    [primary, ...extras] = extras;
  }
  if (primary) {
    setSetting(db, PRIMARY_KEY, primary);
  } else {
    db.prepare("DELETE FROM settings WHERE key = ?").run(PRIMARY_KEY);
  }
  if (extras.length > 0) {
    setSetting(db, EXTRAS_KEY, JSON.stringify(extras));
  } else {
    db.prepare("DELETE FROM settings WHERE key = ?").run(EXTRAS_KEY);
  }
  return { primary, extras };
}

/** Register a folder: it becomes the primary if none exists, else an extra. */
export function addLibraryFolder(
  db: Database.Database,
  dir: string,
): LibraryFolders {
  const current = getLibraryFolders(db);
  if (!current.primary) {
    return saveLibraryFolders(db, { primary: dir, extras: current.extras });
  }
  return saveLibraryFolders(db, {
    primary: current.primary,
    extras: [...current.extras, dir],
  });
}

export function isWithinFolder(folder: string, target: string): boolean {
  const root = path.resolve(folder);
  const resolved = path.resolve(target);
  return resolved === root || resolved.startsWith(root + path.sep);
}
