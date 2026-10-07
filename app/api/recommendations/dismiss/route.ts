import { NextRequest } from "next/server";
import { getDb, dismissRecommendation, recordRecommendationEvent } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, "mutation");
  if (limited) return limited;
  let body: { tmdb_id?: unknown; engine?: unknown; title?: unknown; year?: unknown; pl_title?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { tmdb_id } = body;
  const engine = typeof body.engine === "string" ? body.engine : "";

  if (!tmdb_id || typeof tmdb_id !== "number") {
    return Response.json({ error: "tmdb_id is required" }, { status: 400 });
  }

  const db = getDb();
  dismissRecommendation(db, tmdb_id, {
    title: typeof body.title === "string" ? body.title.slice(0, 300) : null,
    year: Number.isInteger(body.year) ? (body.year as number) : null,
    pl_title: typeof body.pl_title === "string" ? body.pl_title.slice(0, 300) : null,
  });
  recordRecommendationEvent(db, tmdb_id, engine, "dismiss");
  return Response.json({ ok: true });
}
