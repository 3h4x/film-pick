import type Database from "better-sqlite3";
import { getSetting, setSetting } from "@/lib/db";
import type { CachedDir, DirListing, ScanCache } from "@/lib/scanner";

// Even if directory mtimes could be trusted forever, a share that does not bump
// them (some SMB/AFP setups) would hide changes forever, so a full re-list is
// forced this often regardless.
export const FULL_SCAN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const LAST_FULL_SCAN_KEY = "last_full_scan_at";

export function shouldForceFullScan(
  db: Database.Database,
  now = Date.now(),
): boolean {
  const last = Number(getSetting(db, LAST_FULL_SCAN_KEY));
  return !Number.isFinite(last) || last <= 0 || now - last > FULL_SCAN_INTERVAL_MS;
}

export function markFullScan(db: Database.Database, now = Date.now()): void {
  setSetting(db, LAST_FULL_SCAN_KEY, String(now));
}

interface Row {
  dir: string;
  mtime_ms: number;
  scanned_at_ms: number;
  listing: string;
}

function isWithin(root: string, dir: string): boolean {
  return dir === root || dir.startsWith(root.endsWith("/") ? root : root + "/");
}

/**
 * Directory listings kept in SQLite (`scan_dirs`). Reads come from memory,
 * loaded once per root; writes are buffered and flushed in one transaction, and
 * directories that vanished from the last completed scan are dropped.
 */
export function createDbScanCache(db: Database.Database, root: string) {
  const entries = new Map<string, CachedDir>();
  const touched = new Set<string>();
  const dirty = new Map<string, CachedDir>();

  for (const row of db.prepare("SELECT * FROM scan_dirs").iterate() as Iterable<Row>) {
    if (!isWithin(root, row.dir)) continue;
    try {
      entries.set(row.dir, {
        mtimeMs: row.mtime_ms,
        scannedAtMs: row.scanned_at_ms,
        listing: JSON.parse(row.listing) as DirListing,
      });
    } catch {
      // a corrupt row is just a cache miss
    }
  }

  const cache: ScanCache = {
    get(dir) {
      touched.add(dir);
      return entries.get(dir);
    },
    set(dir, entry) {
      touched.add(dir);
      entries.set(dir, entry);
      dirty.set(dir, entry);
    },
  };

  /** Persist new listings; with `prune`, forget directories not seen this scan. */
  function flush({ prune }: { prune: boolean }) {
    const upsert = db.prepare(
      "INSERT OR REPLACE INTO scan_dirs (dir, mtime_ms, scanned_at_ms, listing) VALUES (?, ?, ?, ?)",
    );
    const remove = db.prepare("DELETE FROM scan_dirs WHERE dir = ?");
    db.transaction(() => {
      for (const [dir, e] of dirty) {
        upsert.run(dir, e.mtimeMs, e.scannedAtMs, JSON.stringify(e.listing));
      }
      if (prune) {
        for (const dir of entries.keys()) {
          if (!touched.has(dir)) remove.run(dir);
        }
      }
    })();
    dirty.clear();
  }

  return { cache, flush };
}
