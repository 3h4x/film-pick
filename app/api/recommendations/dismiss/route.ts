import { NextRequest } from "next/server";
import {
  getDb,
  dismissRecommendation,
  isDismissed,
  recordRecommendationEvent,
  undismissRecommendation,
} from "@/lib/db";
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

function tmdbIdParam(request: NextRequest): number | null {
  const raw = request.nextUrl.searchParams.get("tmdb_id");
  const id = raw && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Whether a film is dismissed ("not interested"), for the movie detail's toggle. */
export async function GET(request: NextRequest) {
  const tmdbId = tmdbIdParam(request);
  if (tmdbId === null) {
    return Response.json({ error: "tmdb_id is required" }, { status: 400 });
  }
  return Response.json({ dismissed: isDismissed(getDb(), tmdbId) });
}

/** Undo a dismissal (the detail's "not interested" toggled off). */
export async function DELETE(request: NextRequest) {
  const limited = rateLimit(request, "mutation");
  if (limited) return limited;
  const tmdbId = tmdbIdParam(request);
  if (tmdbId === null) {
    return Response.json({ error: "tmdb_id is required" }, { status: 400 });
  }
  const db = getDb();
  undismissRecommendation(db, tmdbId);
  recordRecommendationEvent(db, tmdbId, "", "undismiss");
  return Response.json({ ok: true });
}
