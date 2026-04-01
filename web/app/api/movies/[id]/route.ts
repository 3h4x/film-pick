import { NextRequest } from "next/server";
import { getDb, deleteMovie } from "@/lib/db";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  deleteMovie(db, parseInt(id, 10));
  return Response.json({ ok: true });
}
