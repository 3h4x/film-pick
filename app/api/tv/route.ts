import { getDb, getSetting } from "@/lib/db";
import {
  getMemCache,
  fetchAndCacheEpg,
  invalidateMemCache,
} from "@/lib/epg-fetch";

export async function GET(request: Request) {
  const db = getDb();

  if (getSetting(db, "epg_enabled") === "false") {
    return Response.json({ error: "TV guide is disabled" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const bust = searchParams.get("bust") === "1";

  if (bust) invalidateMemCache();

  const cached = getMemCache();
  if (cached) {
    return Response.json({ ...cached, cached: true });
  }

  try {
    const result = await fetchAndCacheEpg(db);
    return Response.json({ ...result, cached: false });
  } catch (err) {
    const e = err as { message?: string };
    return Response.json(
      { error: `Failed to fetch EPG: ${e?.message ?? "unknown error"}` },
      { status: 502 },
    );
  }
}
