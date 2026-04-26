import { NextRequest, NextResponse } from "next/server";
import { getDb, Movie } from "@/lib/db";
import { getErrorMessage } from "@/lib/utils";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execFileAsync = promisify(execFile);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: movieId } = await params;
  const { action = "play" } = await req.json(); // "play" or "folder"

  try {
    const db = getDb();
    const movie = db
      .prepare("SELECT * FROM movies WHERE id = ?")
      .get(movieId) as Movie | undefined;
    if (!movie || !movie.file_path) {
      return NextResponse.json(
        { error: "Movie or file path not found" },
        { status: 404 },
      );
    }

    const filePath = movie.file_path;
    const extraFiles = movie.extra_files ? JSON.parse(movie.extra_files) : [];
    const allFiles = [filePath, ...extraFiles];

    // Check if files exist
    const missing = [];
    for (const f of allFiles) {
      try {
        await fs.access(f);
      } catch (e) {
        missing.push(f);
      }
    }

    if (missing.length === allFiles.length) {
      return NextResponse.json(
        {
          error: "No files found on disk",
          path: filePath,
          code: "FILE_NOT_FOUND",
        },
        { status: 404 },
      );
    }

    if (action === "play") {
      console.log(`[Play] Opening files in VLC: ${allFiles.join(", ")}`);
      try {
        await execFileAsync("open", ["-a", "VLC", ...allFiles]);
      } catch (e) {
        console.warn(`[Play] Failed to open in VLC, trying default player:`, e);
        await execFileAsync("open", allFiles);
      }
      return NextResponse.json({ ok: true, message: "Playing movie" });
    } else if (action === "folder") {
      console.log(`[Play] Opening folder: ${path.dirname(filePath)}`);
      await execFileAsync("open", [path.dirname(filePath)]);
      return NextResponse.json({ ok: true, message: "Opening folder" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[Play API Error]", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
