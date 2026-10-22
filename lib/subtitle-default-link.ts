import fs from "fs/promises";
import path from "path";

/** Keep a relative English alias for players that only discover `<video>.srt`. */
export async function ensureDefaultEnglishLink(videoPath: string): Promise<void> {
  const base = path.join(
    path.dirname(videoPath),
    path.basename(videoPath, path.extname(videoPath)),
  );
  const englishPath = base + ".en.srt";
  if (!(await fs.stat(englishPath).catch(() => null))?.isFile()) return;
  try {
    // symlink fails with EEXIST even for a dangling link: never replace user files.
    await fs.symlink(path.basename(englishPath), base + ".srt");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}
