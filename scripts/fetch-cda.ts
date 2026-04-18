/**
 * Fetch CDA Premium movies and store in recommended_movies.
 * Usage: pnpm dlx tsx scripts/fetch-cda.ts
 */

import Database from "better-sqlite3";
import path from "path";
import { fetchAndStoreCdaMovies } from "../lib/cda-fetch";

const dbPath = path.join(process.cwd(), "data", "movies.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

fetchAndStoreCdaMovies(db)
  .then(() => db.close())
  .catch((err) => {
    console.error(err);
    db.close();
    process.exit(1);
  });
