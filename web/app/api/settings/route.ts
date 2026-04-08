import { NextRequest } from "next/server";
import { getDb, getSetting, setSetting } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const libraryPath = getSetting(db, "library_path");
  const groupOrder = getSetting(db, "rec_group_order");
  const recConfig = getSetting(db, "rec_config");
  return Response.json({
    library_path: libraryPath,
    rec_group_order: groupOrder ? JSON.parse(groupOrder) : [],
    rec_config: recConfig ? JSON.parse(recConfig) : null,
  });
}

export async function PATCH(request: NextRequest) {
  const db = getDb();
  const body = await request.json();
  if (body.rec_group_order) {
    setSetting(db, "rec_group_order", JSON.stringify(body.rec_group_order));
  }
  if (body.rec_config) {
    setSetting(db, "rec_config", JSON.stringify(body.rec_config));
  }
  return Response.json({ ok: true });
}
