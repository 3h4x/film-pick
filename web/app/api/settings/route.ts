import { getDb, getSetting } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const libraryPath = getSetting(db, "library_path");
  return Response.json({ library_path: libraryPath });
}
