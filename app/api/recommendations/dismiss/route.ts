import { NextRequest } from "next/server";
import {
  getDb,
  dismissRecommendation,
  isDismissed,
  recordRecommendationEvent,
  undismissRecommendation,
  type DismissedKind,
} from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

/** `media_type: "tv"` dismisses a series; anything else is a film. */
function kindOf(value: unknown): DismissedKind {
  return value === "tv" ? "tv" : "movie";
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, "mutation");
  if (limited) return limited;
  let body: { tmdb_id?: unknown; media_type?: unknown; engine?: unknown; title?: unknown; year?: unknown; pl_title?: unknown };
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

  const kind = kindOf(body.media_type);
  const db = getDb();
  dismissRecommendation(
    db,
    tmdb_id,
    {
      title: typeof body.title === "string" ? body.title.slice(0, 300) : null,
      year: Number.isInteger(body.year) ? (body.year as number) : null,
      pl_title: typeof body.pl_title === "string" ? body.pl_title.slice(0, 300) : null,
    },
    kind,
  );
  // Recommendation events are film tmdb ids; a series id would land on an unrelated film.
  if (kind === "movie") recordRecommendationEvent(db, tmdb_id, engine, "dismiss");
  return Response.json({ ok: true });
}

function tmdbIdParam(request: NextRequest): number | null {
  const raw = request.nextUrl.searchParams.get("tmdb_id");
  const id = raw && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

function kindParam(request: NextRequest): DismissedKind {
  return kindOf(request.nextUrl.searchParams.get("media_type"));
}

/** Whether a film (or, with `media_type=tv`, a series) is dismissed, for the detail's toggle. */
export async function GET(request: NextRequest) {
  const tmdbId = tmdbIdParam(request);
  if (tmdbId === null) {
    return Response.json({ error: "tmdb_id is required" }, { status: 400 });
  }
  return Response.json({ dismissed: isDismissed(getDb(), tmdbId, kindParam(request)) });
}

/** Undo a dismissal (the detail's "not interested" toggled off). */
export async function DELETE(request: NextRequest) {
  const limited = rateLimit(request, "mutation");
  if (limited) return limited;
  const tmdbId = tmdbIdParam(request);
  if (tmdbId === null) {
    return Response.json({ error: "tmdb_id is required" }, { status: 400 });
  }
  const kind = kindParam(request);
  const db = getDb();
  undismissRecommendation(db, tmdbId, kind);
  if (kind === "movie") recordRecommendationEvent(db, tmdbId, "", "undismiss");
  return Response.json({ ok: true });
}
