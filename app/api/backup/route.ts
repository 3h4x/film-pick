import { NextResponse } from "next/server";
import { backupDb, getBackupStats } from "@/lib/backup";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getBackupStats());
}

export async function POST() {
  try {
    const filename = await backupDb(false);
    return NextResponse.json({ filename, ...getBackupStats() });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
