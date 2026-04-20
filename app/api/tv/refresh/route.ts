import { getDb, getSetting } from "@/lib/db";
import { runEpgRefreshNow } from "@/lib/epg-scheduler";
import { invalidateMemCache } from "@/lib/epg-fetch";

export async function POST() {
  const db = getDb();

  if (getSetting(db, "epg_status") === "running") {
    return Response.json({ error: "refresh already in progress" }, { status: 409 });
  }

  invalidateMemCache();
  runEpgRefreshNow(db);
  return Response.json({ status: "started" });
}
