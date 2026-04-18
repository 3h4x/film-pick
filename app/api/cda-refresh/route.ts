import { getDb, getSetting } from "@/lib/db";
import { runCdaRefreshNow } from "@/lib/cda-scheduler";

export async function POST() {
  const db = getDb();

  if (getSetting(db, "cda_refresh_status") === "running") {
    return Response.json({ error: "refresh already in progress" }, { status: 409 });
  }

  runCdaRefreshNow(db);
  return Response.json({ status: "started" });
}
