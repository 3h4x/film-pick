<!-- tamtam inspected 2026-05-21 -->
# CDA Refresh Scheduling Implementation Plan

Status: implemented

Goal: keep the CDA Premium availability cache fresh without tying scheduler startup to a route handler or React component. The scheduler is controlled from persisted settings and can also be triggered manually from the Config UI.

## Current Contract

- `instrumentation.ts` is the only startup entrypoint for background jobs. It calls `initCdaScheduler(getDb())` and `initEpgScheduler(getDb())` behind the `NEXT_RUNTIME === "nodejs"` guard.
- `lib/cda-scheduler.ts` owns the CDA timer singleton. It exports `initCdaScheduler(db)`, `rescheduleCdaJob(db)`, and `runCdaRefreshNow(db)`.
- `runCdaRefreshNow(db)` calls `fetchAndStoreCdaMovies(db)` in-process and stores refresh status in the `settings` table.
- `rescheduleCdaJob(db)` clears any active timer, reads `cda_refresh_interval_hours`, and uses `setInterval` when the interval is non-zero.
- `initCdaScheduler(db)` resets a stale `"running"` status to `"idle"` and then delegates to `rescheduleCdaJob(db)`.
- `app/api/cda-refresh/route.ts` is the manual trigger. It returns `409` when a refresh is already running, otherwise starts `runCdaRefreshNow(db)` and returns `{ status: "started" }`.
- `app/api/settings/route.ts` exposes CDA refresh settings and calls `rescheduleCdaJob(db)` after a valid interval update.

## Settings

| Key | Values | Default behavior |
|-----|--------|------------------|
| `cda_refresh_interval_hours` | `"0"`, `"6"`, `"12"`, `"24"` | Missing/null is treated as `0` (off) |
| `cda_last_refresh` | ISO 8601 string | Missing/null means never refreshed |
| `cda_movie_count` | integer as string | Missing/null means unknown |
| `cda_refresh_status` | `"idle"`, `"running"`, `"error"` | Missing/null is treated as `"idle"` |

## Implementation Checklist

- [x] Add `lib/cda-scheduler.ts` with `initCdaScheduler`, `rescheduleCdaJob`, and `runCdaRefreshNow`.
- [x] Initialize the CDA scheduler from `instrumentation.ts`.
- [x] Add `POST /api/cda-refresh` for manual refresh.
- [x] Extend `GET /api/settings` with CDA refresh fields.
- [x] Extend `PATCH /api/settings` to validate `cda_refresh_interval_hours` and reschedule immediately.
- [x] Add Config UI controls for the CDA interval and manual refresh state.

## Review Checklist

When changing CDA refresh behavior, verify all of these paths together:

- Startup: `instrumentation.ts`
- Scheduler: `lib/cda-scheduler.ts`
- Manual API trigger: `app/api/cda-refresh/route.ts`
- Settings API: `app/api/settings/route.ts`
- Config UI: `components/ConfigPanel.tsx`
- CDA fetch/cache implementation: `lib/cda-fetch.ts`

Do not reintroduce route-triggered scheduler startup. API routes may run a refresh or reschedule an existing timer after settings changes, but long-lived startup side effects belong in `instrumentation.ts`.
