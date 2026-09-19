import fs from "fs/promises";

/**
 * Move a file, falling back to copy + unlink when source and destination sit on
 * different filesystems (rename fails with EXDEV, e.g. between two mounted
 * network shares). The source is only removed once the copy succeeded.
 */
export async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await fs.rename(src, dest);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await fs.copyFile(src, dest);
    await fs.unlink(src);
  }
}
