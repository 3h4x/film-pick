import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function loadBetterSqlite3() {
  const Database = require("better-sqlite3");
  const db = new Database(":memory:");
  db.close();
}

try {
  loadBetterSqlite3();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("NODE_MODULE_VERSION")) {
    throw error;
  }

  console.warn(
    "[pretest] better-sqlite3 was built for a different Node ABI; rebuilding it now.",
  );
  const result = spawnSync("pnpm", ["rebuild", "better-sqlite3"], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  loadBetterSqlite3();
}
