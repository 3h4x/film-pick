import type Database from "better-sqlite3";
import { getSetting, setSetting } from "@/lib/db";
import { fetchAndStoreCdaMovies } from "@/lib/cda-fetch";

let activeTimer: ReturnType<typeof setInterval> | null = null;

export function runCdaRefreshNow(db: Database.Database): void {
  if (getSetting(db, "cda_refresh_status") === "running") return;
  setSetting(db, "cda_refresh_status", "running");

  fetchAndStoreCdaMovies(db)
    .then(() => {
      const row = db
        .prepare("SELECT COUNT(*) as c FROM recommended_movies WHERE engine = 'cda'")
        .get() as { c: number };
      setSetting(db, "cda_last_refresh", new Date().toISOString());
      setSetting(db, "cda_movie_count", String(row.c));
      setSetting(db, "cda_refresh_status", "idle");
    })
    .catch((err) => {
      console.error("[cda] Refresh failed:", err);
      setSetting(db, "cda_refresh_status", "error");
    });
}

export function rescheduleCdaJob(db: Database.Database): void {
  if (activeTimer !== null) {
    clearInterval(activeTimer);
    activeTimer = null;
  }

  const intervalStr = getSetting(db, "cda_refresh_interval_hours");
  const hours = intervalStr ? parseInt(intervalStr, 10) : 0;
  if (hours === 0) return;

  const ms = hours * 60 * 60 * 1000;
  activeTimer = setInterval(() => {
    runCdaRefreshNow(db);
  }, ms);
}

export function initCdaScheduler(db: Database.Database): void {
  // Reset stale "running" status left over from a previous crash
  if (getSetting(db, "cda_refresh_status") === "running") {
    setSetting(db, "cda_refresh_status", "idle");
  }
  rescheduleCdaJob(db);
}
