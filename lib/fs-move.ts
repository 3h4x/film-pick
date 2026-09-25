import fs from "fs/promises";

/** Suffix of an in-flight cross-filesystem copy; not a video extension, so sync never indexes it. */
export const PARTIAL_SUFFIX = ".filmpick-partial";

/**
 * Move a file, falling back to copy + unlink when source and destination sit on
 * different filesystems (rename fails with EXDEV, e.g. between two mounted
 * network shares). The source is only removed once the copy succeeded.
 *
 * The copy goes to `<dest>.filmpick-partial` and is renamed into place only when
 * complete. A copy of a multi-GB file over a share takes minutes, and one cut
 * short (container restart, failed write) must never leave a truncated file
 * under the real name: that would block every retry as "target exists" and get
 * indexed as a movie by the next sync.
 */
export async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await fs.rename(src, dest);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    const partial = dest + PARTIAL_SUFFIX;
    try {
      await fs.copyFile(src, partial);
      await fs.rename(partial, dest);
    } catch (copyError) {
      await fs.rm(partial, { force: true });
      throw copyError;
    }
    await fs.unlink(src);
  }
}
