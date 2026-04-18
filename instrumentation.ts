export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { backupDb } = await import("@/lib/backup");
  const { getDb, getSetting } = await import("@/lib/db");
  const { initCdaScheduler } = await import("@/lib/cda-scheduler");

  const INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes

  const run = async () => {
    const enabled = getSetting(getDb(), "backup_enabled");
    if (enabled === "false") return;

    try {
      const filename = await backupDb();
      console.log(`[backup] ${filename}`);
    } catch (err) {
      console.error("[backup] failed:", (err as Error).message);
    }
  };

  run();
  setInterval(run, INTERVAL_MS);

  initCdaScheduler(getDb());
}
