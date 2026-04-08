import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  const { sourceId, targetId } = await request.json();

  if (!sourceId || !targetId || sourceId === targetId) {
    return Response.json({ error: "Invalid IDs" }, { status: 400 });
  }

  const db = getDb();
  const source = db.prepare("SELECT * FROM movies WHERE id = ?").get(sourceId) as any;
  const target = db.prepare("SELECT * FROM movies WHERE id = ?").get(targetId) as any;

  if (!source || !target) {
    return Response.json({ error: "Movie(s) not found" }, { status: 404 });
  }

  const updates: Record<string, any> = {};

  // Fields to merge with specific strategies
  // 1. Prefer non-null, then prefer higher/more complete
  
  // user_rating: take max
  if (source.user_rating || target.user_rating) {
    updates.user_rating = Math.max(Number(source.user_rating || 0), Number(target.user_rating || 0)) || null;
  }

  // rating: take max (global rating)
  if (source.rating || target.rating) {
    updates.rating = Math.max(Number(source.rating || 0), Number(target.rating || 0)) || null;
  }

  // description: take longer one
  if (source.description || target.description) {
    const sDesc = source.description || "";
    const tDesc = target.description || "";
    updates.description = sDesc.length > tDesc.length ? sDesc : tDesc;
  }

  // Simple non-null fields
  const fields = [
    "tmdb_id",
    "imdb_id",
    "genre",
    "director",
    "poster_url",
    "pl_title",
    "rated_at",
    "file_path",
    "source",
    "filmweb_id",
    "filmweb_url",
    "cda_url",
    "type",
    "year",
    "extra_files"
  ];

  // Get current table info to be safe
  const cols = db.pragma("table_info(movies)") as { name: string }[];
  const existingCols = new Set(cols.map(c => c.name));

  for (const f of fields) {
    if (existingCols.has(f) && !target[f] && source[f]) {
      updates[f] = source[f];
    }
  }

  // Combine genres if both exist
  if (existingCols.has("genre") && source.genre && target.genre) {
    const sGenres = source.genre.split(",").map((g: string) => g.trim());
    const tGenres = target.genre.split(",").map((g: string) => g.trim());
    const allGenres = Array.from(new Set([...sGenres, ...tGenres])).filter(Boolean);
    updates.genre = allGenres.join(", ");
  }

  // Remove fields that already match target to avoid redundant updates
  for (const f in updates) {
    if (updates[f] === target[f]) {
      delete updates[f];
    }
  }

  try {
    const updateKeys = Object.keys(updates);
    const updateParams = Object.values(updates);

    const transaction = db.transaction(() => {
      // First clear source unique fields to avoid UNIQUE constraint violation
      if (updates.file_path) {
        db.prepare("UPDATE movies SET file_path = NULL WHERE id = ?").run(sourceId);
      }
      if (updates.title && updates.year) {
         db.prepare("UPDATE movies SET title = 'merged-placeholder', year = NULL WHERE id = ?").run(sourceId);
      }
      
      // Combine extra_files if both exist
      if (source.extra_files || target.extra_files) {
        const sExtra = source.extra_files ? JSON.parse(source.extra_files) : [];
        const tExtra = target.extra_files ? JSON.parse(target.extra_files) : [];
        const allExtra = Array.from(new Set([...sExtra, ...tExtra])).filter(Boolean);
        if (allExtra.length > 0) {
          updates.extra_files = JSON.stringify(allExtra);
        }
      }

      if (updateKeys.length > 0) {
        const setClause = updateKeys.map(k => `${k} = ?`).join(", ");
        db.prepare(`UPDATE movies SET ${setClause} WHERE id = ?`).run(...updateParams, targetId);
      }
      db.prepare("DELETE FROM movies WHERE id = ?").run(sourceId);
    });

    transaction();

    return Response.json({ 
      ok: true, 
      message: "Movies merged successfully",
      targetId 
    });
  } catch (error: any) {
    console.error("Merge failed:", error);
    return Response.json({ error: error.message || "Failed to merge movies" }, { status: 500 });
  }
}
