# TODO

Done and no longer listed: incremental, parallel library scan (`lib/scanner.ts` `scanLibraryGenerator`, `lib/scan-cache.ts`,
`scan_dirs` table), periodic re-match of films added without a TMDb id (`lib/tmdb-rematch.ts`, `movies.tmdb_matched_at`), and
sync enrichment that only fills gaps (`fillOnly` in `lib/tmdb-refresh.ts`).

## Open

- **Import still uses the old scan.** `app/api/import/route.ts` walks with the synchronous `scanDirectoryGenerator`
  (one `readdirSync` at a time, blocks the event loop). Moving it to `scanLibraryGenerator` would make first imports of a big
  folder as fast as syncs; it needs the import tests' generator mocks changed the way `sync-api.test.ts` was.
- **Shares that do not bump directory mtimes** are only caught by the weekly (or manual "Full rescan") full scan. If that
  turns out to matter, add a cheap per-directory entry-count check next to the mtime.
- **Rematch is conservative** (strong title match only). Rows it cannot match stay `source = 'local'`; a manual "match to
  TMDb" action in the detail view would cover the rest.
