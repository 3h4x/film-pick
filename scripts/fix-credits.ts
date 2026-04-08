/**
 * Re-fetch director/writer/actors from TMDb for all movies with a tmdb_id.
 * Fixes mismatched credits caused by earlier dedup bugs.
 *
 * Usage: eval "$(bioenv load)" && pnpm dlx tsx scripts/fix-credits.ts [--dry-run]
 */

import Database from "better-sqlite3";
import path from "path";

const TMDB_BASE = "https://api.themoviedb.org/3";
const API_KEY = process.env.TMDB_API_KEY;
const DRY_RUN = process.argv.includes("--dry-run");

if (!API_KEY) {
  console.error('TMDB_API_KEY not set. Run: eval "$(bioenv load)"');
  process.exit(1);
}

const dbPath = path.join(__dirname, "../data/movies.db");
const db = new Database(dbPath);

async function fetchCredits(
  tmdbId: number,
): Promise<{
  director: string | null;
  writer: string | null;
  actors: string | null;
}> {
  const res = await fetch(
    `${TMDB_BASE}/movie/${tmdbId}?append_to_response=credits`,
    {
      headers: { Authorization: `Bearer ${API_KEY}` },
    },
  );
  if (!res.ok) return { director: null, writer: null, actors: null };
  const data = await res.json();
  const director =
    data.credits?.crew?.find((c: any) => c.job === "Director")?.name || null;
  const writer =
    data.credits?.crew
      ?.filter((c: any) => ["Screenplay", "Writer", "Story"].includes(c.job))
      .map((c: any) => c.name)
      .join(", ") || null;
  const actors =
    data.credits?.cast
      ?.slice(0, 5)
      .map((c: any) => c.name)
      .join(", ") || null;
  return { director, writer, actors };
}

async function main() {
  const movies = db
    .prepare(
      "SELECT id, title, year, tmdb_id, director, writer, actors FROM movies WHERE tmdb_id IS NOT NULL",
    )
    .all() as any[];

  console.log(
    `Found ${movies.length} movies with tmdb_id. ${DRY_RUN ? "(DRY RUN)" : ""}`,
  );

  const update = db.prepare(
    "UPDATE movies SET director = ?, writer = ?, actors = ? WHERE id = ?",
  );
  let fixed = 0;
  let unchanged = 0;
  let failed = 0;

  for (let i = 0; i < movies.length; i++) {
    const m = movies[i];
    try {
      const credits = await fetchCredits(m.tmdb_id);
      if (!credits.director && !credits.writer && !credits.actors) {
        failed++;
        continue;
      }

      const changed =
        credits.director !== m.director ||
        credits.writer !== m.writer ||
        credits.actors !== m.actors;
      if (changed) {
        if (!DRY_RUN) {
          update.run(credits.director, credits.writer, credits.actors, m.id);
        }
        console.log(
          `[${i + 1}/${movies.length}] FIXED "${m.title}" (${m.year}): ${m.director} -> ${credits.director}`,
        );
        fixed++;
      } else {
        unchanged++;
      }

      // Rate limit: ~3 req/sec
      if ((i + 1) % 3 === 0) await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error(`[${i + 1}/${movies.length}] ERROR "${m.title}": ${e}`);
      failed++;
    }
  }

  console.log(
    `\nDone. Fixed: ${fixed}, Unchanged: ${unchanged}, Failed: ${failed}`,
  );
  db.close();
}

main();
