import { NextRequest } from "next/server";
import { getDb, getMovies, getDismissedIds, getSetting } from "@/lib/db";
import { buildContext, getCdaLookup, enrichWithCda, type RecConfig } from "@/lib/engines";
import { moodEngine } from "@/lib/engines/mood";
import { MOOD_PRESETS, type MoodKey } from "@/lib/mood-presets";

export async function GET(request: NextRequest) {
  const moodKey = request.nextUrl.searchParams.get("key") as MoodKey | null;
  if (!moodKey || !(moodKey in MOOD_PRESETS)) {
    return Response.json({ error: "invalid mood key" }, { status: 400 });
  }

  const db = getDb();
  const allMovies = getMovies(db);
  const movies = allMovies.filter((m) => m.source !== "recommendation");
  const dismissedIds = getDismissedIds(db);
  const cdaLookup = getCdaLookup();

  const configRaw = getSetting(db, "rec_config");
  const config: RecConfig | undefined = configRaw
    ? (() => { try { return JSON.parse(configRaw); } catch { return undefined; } })()
    : undefined;

  const ctx = buildContext(movies, dismissedIds, config);

  let groups;
  try {
    groups = await moodEngine(ctx, moodKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return Response.json({ error: message }, { status: 500 });
  }

  const enriched = groups.map((g) => ({
    ...g,
    recommendations: enrichWithCda(g.recommendations, cdaLookup),
  }));

  return Response.json(enriched);
}
