import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { initDb } from "@/lib/db";
import { scanLibraryGenerator, type ScanCache, type CachedDir, type ScanStats } from "@/lib/scanner";
import {
  createDbScanCache,
  markFullScan,
  shouldForceFullScan,
  FULL_SCAN_INTERVAL_MS,
} from "@/lib/scan-cache";

const OLD = new Date(Date.now() - 60 * 60 * 1000); // an hour ago: well outside the racy window

function memoryCache(): ScanCache & { entries: Map<string, CachedDir> } {
  const entries = new Map<string, CachedDir>();
  return {
    entries,
    get: (dir) => entries.get(dir),
    set: (dir, entry) => void entries.set(dir, entry),
  };
}

async function collect(root: string, options: Parameters<typeof scanLibraryGenerator>[1] = {}) {
  const found: string[] = [];
  for await (const file of scanLibraryGenerator(root, options)) found.push(file.filePath);
  return found.sort();
}

describe("scanLibraryGenerator", () => {
  let root: string;

  function touch(rel: string) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, "x");
    return full;
  }
  function age(...rels: string[]) {
    // Directories last, deepest first: writing into one changes its mtime.
    for (const rel of rels) fs.utimesSync(path.join(root, rel), OLD, OLD);
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-lib-"));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("finds video files in nested folders and applies the same filters as the sync scanner", async () => {
    touch("Dune (2021)/Dune.2021.mkv");
    touch("Dune (2021)/notes.txt");
    touch("Dune (2021)/.hidden.mkv");
    touch("#recycle/Trash.2000.mkv");
    touch("Home Movies/Holiday.2010.mp4");
    touch("Alien (1979).avi");

    const found = await collect(root);
    expect(found.map((f) => path.relative(root, f))).toEqual([
      "Alien (1979).avi",
      path.join("Dune (2021)", "Dune.2021.mkv"),
    ]);
  });

  it("walks many folders in parallel and yields every file", async () => {
    for (let i = 0; i < 40; i++) touch(`Film ${i} (20${String(i % 25).padStart(2, "0")})/Film ${i}.mkv`);
    expect(await collect(root, { concurrency: 8 })).toHaveLength(40);
  });

  it("does not list unchanged directories again", async () => {
    touch("A (2001)/A.2001.mkv");
    touch("B (2002)/B.2002.mkv");
    age("A (2001)", "B (2002)", ".");
    const cache = memoryCache();

    const first: ScanStats = { dirsListed: 0, dirsCached: 0 };
    await collect(root, { cache, stats: first });
    expect(first).toEqual({ dirsListed: 3, dirsCached: 0 });

    const second: ScanStats = { dirsListed: 0, dirsCached: 0 };
    const found = await collect(root, { cache, stats: second });
    expect(second).toEqual({ dirsListed: 0, dirsCached: 3 });
    expect(found).toHaveLength(2); // still reported, straight from the cache
  });

  it("picks up a new file because its directory's mtime changed", async () => {
    touch("A (2001)/A.2001.mkv");
    age("A (2001)", ".");
    const cache = memoryCache();
    await collect(root, { cache });

    touch("A (2001)/A.2001.CD2.mkv"); // bumps A's mtime, not the root's
    const stats: ScanStats = { dirsListed: 0, dirsCached: 0 };
    const found = await collect(root, { cache, stats });

    expect(found).toHaveLength(2);
    expect(stats).toEqual({ dirsListed: 1, dirsCached: 1 });
  });

  it("notices a removed file and a removed folder", async () => {
    const gone = touch("A (2001)/A.2001.mkv");
    touch("B (2002)/B.2002.mkv");
    age("A (2001)", "B (2002)", ".");
    const cache = memoryCache();
    await collect(root, { cache });

    fs.rmSync(gone);
    fs.rmSync(path.join(root, "B (2002)"), { recursive: true });
    const found = await collect(root, { cache });
    expect(found).toEqual([]);
  });

  it("does not trust a listing taken right after the directory changed (racy timestamp)", async () => {
    touch("A (2001)/A.2001.mkv"); // mtime is "now", so scannedAt - mtime is tiny
    const cache = memoryCache();
    await collect(root, { cache });

    const stats: ScanStats = { dirsListed: 0, dirsCached: 0 };
    await collect(root, { cache, stats });
    expect(stats.dirsCached).toBe(0);
    expect(stats.dirsListed).toBe(2);
  });

  it("full re-lists everything even with a warm cache", async () => {
    touch("A (2001)/A.2001.mkv");
    age("A (2001)", ".");
    const cache = memoryCache();
    await collect(root, { cache });

    const stats: ScanStats = { dirsListed: 0, dirsCached: 0 };
    await collect(root, { cache, full: true, stats });
    expect(stats).toEqual({ dirsListed: 2, dirsCached: 0 });
  });

  it("finds a file the cache did not know about after a full scan", async () => {
    touch("A (2001)/A.2001.mkv");
    age("A (2001)", ".");
    const cache = memoryCache();
    await collect(root, { cache });

    // A share that does not bump directory mtimes: the file appears, mtime unchanged.
    touch("A (2001)/Late.2005.mkv");
    age("A (2001)");
    expect(await collect(root, { cache })).toHaveLength(1); // stale, as documented
    expect(await collect(root, { cache, full: true })).toHaveLength(2);
  });

  it("returns nothing for a missing root and does not cache it", async () => {
    const cache = memoryCache();
    const found = await collect(path.join(root, "nope"), { cache });
    expect(found).toEqual([]);
    expect(cache.entries.size).toBe(0);
  });
});

describe("scan cache in SQLite", () => {
  const TEST_DB = path.join(__dirname, "test-scan-cache.db");
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });
  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  const entry = (names: string[]): CachedDir => ({
    mtimeMs: 1000,
    scannedAtMs: 100_000,
    listing: { files: names, dirs: [] },
  });

  it("persists listings across instances", () => {
    const first = createDbScanCache(db, "/movies");
    first.cache.set("/movies", entry(["A.mkv"]));
    first.flush({ prune: false });

    const second = createDbScanCache(db, "/movies");
    expect(second.cache.get("/movies")).toEqual(entry(["A.mkv"]));
  });

  it("only loads directories under its own root", () => {
    const a = createDbScanCache(db, "/movies");
    a.cache.set("/movies/x", entry(["A.mkv"]));
    a.cache.set("/movies-archive/y", entry(["B.mkv"]));
    a.flush({ prune: false });

    const b = createDbScanCache(db, "/movies");
    expect(b.cache.get("/movies/x")).toBeDefined();
    expect(b.cache.get("/movies-archive/y")).toBeUndefined();
  });

  it("prunes directories that were not visited by the completed scan", () => {
    const a = createDbScanCache(db, "/movies");
    a.cache.set("/movies/keep", entry(["A.mkv"]));
    a.cache.set("/movies/gone", entry(["B.mkv"]));
    a.flush({ prune: false });

    const b = createDbScanCache(db, "/movies");
    b.cache.get("/movies/keep"); // visited; "gone" was not
    b.flush({ prune: true });

    const rows = db.prepare("SELECT dir FROM scan_dirs ORDER BY dir").all() as { dir: string }[];
    expect(rows.map((r) => r.dir)).toEqual(["/movies/keep"]);
  });

  it("does not prune another root's directories", () => {
    const other = createDbScanCache(db, "/archive");
    other.cache.set("/archive/x", entry(["A.mkv"]));
    other.flush({ prune: false });

    const b = createDbScanCache(db, "/movies");
    b.flush({ prune: true });
    expect(db.prepare("SELECT COUNT(*) AS n FROM scan_dirs").get()).toEqual({ n: 1 });
  });

  it("ignores a corrupt row instead of failing the scan", () => {
    db.prepare("INSERT INTO scan_dirs VALUES ('/movies/bad', 1, 2, 'not json')").run();
    const c = createDbScanCache(db, "/movies");
    expect(c.cache.get("/movies/bad")).toBeUndefined();
  });

  it("forces a full scan when there was never one, and again after a week", () => {
    const now = 1_000_000_000_000;
    expect(shouldForceFullScan(db, now)).toBe(true);
    markFullScan(db, now);
    expect(shouldForceFullScan(db, now + 1000)).toBe(false);
    expect(shouldForceFullScan(db, now + FULL_SCAN_INTERVAL_MS + 1)).toBe(true);
  });
});
