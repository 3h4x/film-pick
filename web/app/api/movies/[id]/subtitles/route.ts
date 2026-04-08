import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

const SUBTITLE_EXTENSIONS = [".srt", ".sub", ".txt", ".ass"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const movieId = parseInt(id, 10);

  const movie = db.prepare("SELECT * FROM movies WHERE id = ?").get(movieId) as any;
  if (!movie || !movie.file_path) {
    return Response.json({ hasSubtitles: false });
  }

  const filePath = movie.file_path;
  if (!fsSync.existsSync(filePath)) {
    return Response.json({ hasSubtitles: false, error: "Movie file not found" });
  }

  const movieDir = path.dirname(filePath);
  const movieFileNameNoExt = path.basename(filePath, path.extname(filePath));

  try {
    const files = await fs.readdir(movieDir);
    const subtitles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      const nameNoExt = path.basename(file, ext);
      return SUBTITLE_EXTENSIONS.includes(ext) && (nameNoExt === movieFileNameNoExt || nameNoExt.startsWith(movieFileNameNoExt));
    });

    return Response.json({ 
      hasSubtitles: subtitles.length > 0,
      subtitles: subtitles.map(s => ({
        name: s,
        path: path.join(movieDir, s)
      }))
    });
  } catch (e) {
    return Response.json({ hasSubtitles: false, error: "Failed to read directory" });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const movieId = parseInt(id, 10);

  const movie = db.prepare("SELECT * FROM movies WHERE id = ?").get(movieId) as any;
  if (!movie || !movie.file_path) {
    return Response.json({ error: "Movie or file path not found" }, { status: 404 });
  }

  const filePath = movie.file_path;
  if (!fsSync.existsSync(filePath)) {
    return Response.json({ error: "Movie file not found on disk" }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    const movieDir = path.dirname(filePath);
    const movieFileNameNoExt = path.basename(filePath, path.extname(filePath));
    const originalExt = path.extname(file.name).toLowerCase();
    
    if (!SUBTITLE_EXTENSIONS.includes(originalExt)) {
      return Response.json({ error: "Invalid subtitle extension. Supported: .srt, .sub, .txt, .ass" }, { status: 400 });
    }

    // Always use .srt as extension for all subtitle files
    // If the movie file was already standardized, movieFileNameNoExt is just Title (no year)
    // The target filename must match the movie filename exactly
    const newFileName = movieFileNameNoExt + ".srt";
    const targetPath = path.join(movieDir, newFileName);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    console.log(`[Subtitles] Uploading for movie ${movieId}: ${file.name} -> ${newFileName}`);
    console.log(`[Subtitles] Target path: ${targetPath}`);
    
    await fs.writeFile(targetPath, buffer);

    console.log(`[Subtitles] Successfully added subtitle for movie ${movieId}: ${newFileName}`);

    return Response.json({ 
      ok: true, 
      message: "Subtitle added successfully",
      fileName: newFileName,
      path: targetPath
    });
  } catch (error: any) {
    console.error("Failed to add subtitle:", error);
    return Response.json({ error: error.message || "Failed to add subtitle" }, { status: 500 });
  }
}
