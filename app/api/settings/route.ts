import { NextRequest } from "next/server";
import { getDb, getSetting, setSetting } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const libraryPath = getSetting(db, "library_path");
  const groupOrder = getSetting(db, "rec_group_order");
  const recConfig = getSetting(db, "rec_config");
  const dbKey = getSetting(db, "tmdb_api_key");
  const envKey = process.env.TMDB_API_KEY;
  const disabledEngines = getSetting(db, "disabled_engines");
  return Response.json({
    library_path: libraryPath,
    rec_group_order: groupOrder ? JSON.parse(groupOrder) : [],
    rec_config: recConfig ? JSON.parse(recConfig) : null,
    tmdb_api_key_set: !!(envKey || dbKey),
    tmdb_api_key_source: envKey ? "env" : dbKey ? "db" : null,
    disabled_engines: disabledEngines ? JSON.parse(disabledEngines) : [],
  });
}

export async function PATCH(request: NextRequest) {
  const db = getDb();
  const body = await request.json();
  try {
  if (body.rec_group_order) {
    setSetting(db, "rec_group_order", JSON.stringify(body.rec_group_order));
  }
  if (body.rec_config) {
    setSetting(db, "rec_config", JSON.stringify(body.rec_config));
  }
  if (body.disabled_engines) {
    setSetting(db, "disabled_engines", JSON.stringify(body.disabled_engines));
  }
  if (typeof body.library_path === "string") {
    if (body.library_path.trim()) {
      setSetting(db, "library_path", body.library_path.trim());
    } else {
      db.prepare("DELETE FROM settings WHERE key = ?").run("library_path");
    }
  }
  if (typeof body.tmdb_api_key === "string") {
    if (body.tmdb_api_key.trim()) {
      setSetting(db, "tmdb_api_key", body.tmdb_api_key.trim());
    } else {
      db.prepare("DELETE FROM settings WHERE key = ?").run("tmdb_api_key");
    }
  }
    return Response.json({ ok: true });
  } catch (err: any) {
    if (err?.code === "SQLITE_READONLY") {
      return Response.json({ error: "Database is read-only — check file permissions on the server" }, { status: 500 });
    }
    return Response.json({ error: err?.message || "Failed to save settings" }, { status: 500 });
  }
}
