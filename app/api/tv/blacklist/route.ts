import { getDb, getSetting, setSetting } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const raw = getSetting(db, "tv_channel_blacklist");
  const list: string[] = raw ? JSON.parse(raw) : [];
  return Response.json(list);
}

export async function PUT(request: Request) {
  const db = getDb();
  const list = (await request.json()) as string[];
  setSetting(db, "tv_channel_blacklist", JSON.stringify(list));
  return Response.json({ ok: true });
}
