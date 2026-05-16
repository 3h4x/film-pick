import { NextRequest } from "next/server";
import {
  getDb,
  recordRecommendationEvent,
  type RecommendationEventType,
} from "@/lib/db";

const VALID_EVENTS: RecommendationEventType[] = ["open", "add", "dismiss"];

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tmdb_id, engine = "", event } = body;

  if (!tmdb_id || typeof tmdb_id !== "number") {
    return Response.json({ error: "tmdb_id is required" }, { status: 400 });
  }
  if (!VALID_EVENTS.includes(event)) {
    return Response.json(
      { error: `event must be one of: ${VALID_EVENTS.join(", ")}` },
      { status: 400 },
    );
  }

  const db = getDb();
  recordRecommendationEvent(db, tmdb_id, engine, event);
  return Response.json({ ok: true });
}
