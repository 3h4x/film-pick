import { cleanTitle, parseFilename } from "./utils";
import fs from "fs";
import path from "path";

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mkv",
  ".avi",
  ".wmv",
  ".m4v",
  ".mov",
  ".flv",
  ".webm",
]);

const IGNORED_DIRECTORY_NAMES = new Set(["Home Movies", "iphotos"]);

function isIgnoredName(name: string): boolean {
  return (
    name.startsWith(".") ||
    name.startsWith("#") ||
    name.includes("#snapshot") ||
    IGNORED_DIRECTORY_NAMES.has(name)
  );
}

export interface ScannedFile {
  filePath: string;
  filename: string;
  parsedTitle: string;
  parsedYear: number | null;
}

export function* scanDirectoryGenerator(
  dirPath: string,
): Generator<ScannedFile> {
  function* walk(dir: string): Generator<ScannedFile> {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (
        entry.name.startsWith(".") ||
        entry.name.startsWith("#") ||
        entry.name.includes("#snapshot")
      )
        continue;
      if (IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (fullPath.includes("#snapshot")) continue;
      if (entry.isDirectory()) {
        yield* walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          const { title, year } = parseFilename(entry.name);
          if (title) {
            yield {
              filePath: fullPath,
              filename: entry.name,
              parsedTitle: title,
              parsedYear: year,
            };
          }
        }
      }
    }
  }

  yield* walk(dirPath);
}

/** What a directory contained when it was last listed (already filtered). */
export interface DirListing {
  files: string[];
  dirs: string[];
}

export interface CachedDir {
  mtimeMs: number;
  scannedAtMs: number;
  listing: DirListing;
}

export interface ScanCache {
  get(dir: string): CachedDir | undefined;
  set(dir: string, entry: CachedDir): void;
}

export interface ScanStats {
  dirsListed: number;
  dirsCached: number;
}

export interface ScanOptions {
  cache?: ScanCache;
  /** Ignore cached listings (they are still refreshed). */
  full?: boolean;
  concurrency?: number;
  stats?: ScanStats;
}

// A directory whose mtime is within this window of the moment it was listed may
// have changed again inside the same timestamp tick, so its cached listing is not
// trusted (the same "racy timestamp" caution git applies to its index).
const RACY_WINDOW_MS = 2_000;

function isFresh(cached: CachedDir | undefined, mtimeMs: number): cached is CachedDir {
  return (
    cached !== undefined &&
    cached.mtimeMs === mtimeMs &&
    cached.scannedAtMs - mtimeMs > RACY_WINDOW_MS
  );
}

async function listDirectory(dir: string): Promise<DirListing | null> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const listing: DirListing = { files: [], dirs: [] };
  for (const entry of entries) {
    if (isIgnoredName(entry.name)) continue;
    if (path.join(dir, entry.name).includes("#snapshot")) continue;
    if (entry.isDirectory()) {
      listing.dirs.push(entry.name);
    } else if (
      entry.isFile() &&
      VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    ) {
      listing.files.push(entry.name);
    }
  }
  return listing;
}

/**
 * Async, parallel counterpart of scanDirectoryGenerator for the library sync.
 *
 * - directories are walked by several workers at once (network shares are
 *   latency-bound, and the old readdirSync walk also blocked the event loop)
 * - with a cache, a directory whose mtime is unchanged since its last listing is
 *   not read again: adding or removing a file changes its parent's mtime, so only
 *   directories that actually changed cost a readdir
 */
export async function* scanLibraryGenerator(
  rootPath: string,
  options: ScanOptions = {},
): AsyncGenerator<ScannedFile> {
  const { cache, full = false, concurrency = 8, stats } = options;
  const found: ScannedFile[] = [];
  const queue: string[] = [rootPath];
  let active = 0;
  let wake: (() => void) | null = null;
  const notify = () => {
    wake?.();
    wake = null;
  };

  async function visit(dir: string) {
    let mtimeMs: number | null = null;
    try {
      mtimeMs = (await fs.promises.stat(dir)).mtimeMs;
    } catch {
      return;
    }
    const cached = cache?.get(dir);
    let listing: DirListing | null;
    if (!full && isFresh(cached, mtimeMs)) {
      listing = cached.listing;
      if (stats) stats.dirsCached++;
    } else {
      listing = await listDirectory(dir);
      if (stats) stats.dirsListed++;
      // Never cache a failed read as "empty": that would hide the folder's
      // contents (and detach its films) until its mtime changed.
      if (listing) cache?.set(dir, { mtimeMs, scannedAtMs: Date.now(), listing });
    }
    if (!listing) return;
    for (const name of listing.files) {
      const { title, year } = parseFilename(name);
      if (!title) continue;
      found.push({
        filePath: path.join(dir, name),
        filename: name,
        parsedTitle: title,
        parsedYear: year,
      });
    }
    for (const name of listing.dirs) queue.push(path.join(dir, name));
  }

  function pump() {
    while (active < concurrency && queue.length > 0) {
      const dir = queue.shift()!;
      active++;
      visit(dir)
        .catch(() => {})
        .finally(() => {
          active--;
          pump();
          notify();
        });
    }
  }

  pump();
  while (true) {
    while (found.length > 0) yield found.shift()!;
    if (active === 0 && queue.length === 0) break;
    await new Promise<void>((resolve) => {
      wake = resolve;
    });
  }
}

export function scanDirectory(dirPath: string): ScannedFile[] {
  return Array.from(scanDirectoryGenerator(dirPath));
}

export { cleanTitle, parseFilename };
