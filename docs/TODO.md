# TODO

## Make sync's file scan fast and incremental

**Observed:** the Sync modal sits on "Scanning files… 344 found" for a long time. The scan walks every configured
folder on every sync (`scanDirectoryGenerator` in `lib/scanner.ts`), one directory at a time, and re-derives everything
from scratch, even though almost nothing changed since the last sync. On a network share that is slow.

**Idea:** remember what has already been scanned and when, and skip what is unchanged.
- Per library folder, record `last_scanned_at` and the folder's mtime; per directory, remember its mtime + entry count and
  only descend into directories whose mtime changed since the last scan (a new film changes its parent's mtime).
- Keep a small `scanned_files` index (path, size, mtime, seen_at) so a file already known by path+size+mtime is not
  re-parsed or re-matched; files missing from a fully completed scan are then detached without a second walk.
- Walk directories with a few parallel `readdir`s (network shares are latency-bound, not CPU-bound).
- Always allow a "full rescan" button for when mtimes lie (some SMB/AFP shares do not bump directory mtimes).
- Never treat an unavailable folder as empty (already true: films on an unmounted folder stay attached).

**Why:** same principle as the TMDb side (`movies.tmdb_refreshed_at`: know what was done and when, don't redo recent work).

## Enrichment leftovers

- Rows imported without a TMDb match (`source = 'local'`, no `tmdb_id`) are never retried; a periodic re-match against
  TMDb by title/year would pick up films TMDb added later.
- `refreshStaleTmdbMetadata` overwrites title/genre/credits from TMDb on every refresh (every 30 days); consider only
  filling gaps if hand-edited titles ever matter.
