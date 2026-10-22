import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { ensureDefaultEnglishLink } from "@/lib/subtitle-default-link";

describe("default English subtitle link", () => {
  let dir: string;
  let videoPath: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "subtitle-link-"));
    videoPath = path.join(dir, "Sample Movie.mkv");
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("creates a relative alias and keeps following replaced English content", async () => {
    await fs.writeFile(path.join(dir, "Sample Movie.en.srt"), "English original");
    await ensureDefaultEnglishLink(videoPath);
    const alias = path.join(dir, "Sample Movie.srt");
    expect(await fs.readlink(alias)).toBe("Sample Movie.en.srt");
    await fs.writeFile(path.join(dir, "Sample Movie.en.srt"), "English updated");
    await ensureDefaultEnglishLink(videoPath);
    expect(await fs.readFile(alias, "utf8")).toBe("English updated");
  });

  it("preserves an existing untagged subtitle", async () => {
    await fs.writeFile(path.join(dir, "Sample Movie.en.srt"), "English");
    const alias = path.join(dir, "Sample Movie.srt");
    await fs.writeFile(alias, "Existing subtitle");
    await ensureDefaultEnglishLink(videoPath);
    expect(await fs.readFile(alias, "utf8")).toBe("Existing subtitle");
    expect((await fs.lstat(alias)).isSymbolicLink()).toBe(false);
  });

  it("preserves a dangling user link", async () => {
    await fs.writeFile(path.join(dir, "Sample Movie.en.srt"), "English");
    const alias = path.join(dir, "Sample Movie.srt");
    await fs.symlink("User subtitle.srt", alias);
    await ensureDefaultEnglishLink(videoPath);
    expect(await fs.readlink(alias)).toBe("User subtitle.srt");
  });

  it("does not create a link when English SubRip is absent", async () => {
    await fs.writeFile(path.join(dir, "Sample Movie.pl.srt"), "Polish");
    await ensureDefaultEnglishLink(videoPath);
    await expect(fs.lstat(path.join(dir, "Sample Movie.srt"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
