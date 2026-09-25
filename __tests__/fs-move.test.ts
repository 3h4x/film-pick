import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { moveFile, PARTIAL_SUFFIX } from "@/lib/fs-move";

describe("moveFile", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-move-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("renames within the same filesystem", async () => {
    const src = path.join(dir, "a.mkv");
    const dest = path.join(dir, "b.mkv");
    await fs.writeFile(src, "video");
    await moveFile(src, dest);
    expect(await fs.readFile(dest, "utf8")).toBe("video");
    await expect(fs.access(src)).rejects.toThrow();
  });

  it("falls back to copy + delete across filesystems (EXDEV)", async () => {
    const src = path.join(dir, "a.mkv");
    const dest = path.join(dir, "b.mkv");
    await fs.writeFile(src, "video");
    vi.spyOn(fs, "rename").mockRejectedValueOnce(
      Object.assign(new Error("cross-device"), { code: "EXDEV" }),
    );
    await moveFile(src, dest);
    expect(await fs.readFile(dest, "utf8")).toBe("video");
    await expect(fs.access(src)).rejects.toThrow();
  });

  it("keeps the source when the copy fails", async () => {
    const src = path.join(dir, "a.mkv");
    await fs.writeFile(src, "video");
    vi.spyOn(fs, "rename").mockRejectedValueOnce(
      Object.assign(new Error("cross-device"), { code: "EXDEV" }),
    );
    await expect(
      moveFile(src, path.join(dir, "missing-dir", "b.mkv")),
    ).rejects.toThrow();
    expect(await fs.readFile(src, "utf8")).toBe("video");
  });

  it("rethrows other rename errors without copying", async () => {
    const copy = vi.spyOn(fs, "copyFile");
    await expect(
      moveFile(path.join(dir, "nope.mkv"), path.join(dir, "b.mkv")),
    ).rejects.toThrow();
    expect(copy).not.toHaveBeenCalled();
  });
});

describe("moveFile partial copies", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-move-partial-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("never leaves a truncated file under the destination name", async () => {
    const src = path.join(dir, "a.mkv");
    const dest = path.join(dir, "b.mkv");
    await fs.writeFile(src, "video");
    vi.spyOn(fs, "rename").mockRejectedValueOnce(
      Object.assign(new Error("cross-device"), { code: "EXDEV" }),
    );
    // The copy dies halfway, after writing some bytes.
    vi.spyOn(fs, "copyFile").mockImplementationOnce(async (_from, to) => {
      await fs.writeFile(to as string, "vid");
      throw new Error("connection reset");
    });
    await expect(moveFile(src, dest)).rejects.toThrow("connection reset");
    await expect(fs.access(dest)).rejects.toThrow();
    await expect(fs.access(dest + PARTIAL_SUFFIX)).rejects.toThrow();
    expect(await fs.readFile(src, "utf8")).toBe("video");
  });
});
