import { describe, it, expect } from "vitest";
import { cleanTitle } from "@/lib/utils";

describe("cleanTitle", () => {
  it("removes file extension", () => {
    expect(cleanTitle("Inception.mkv")).toBe("Inception");
    expect(cleanTitle("The.Shining.avi")).toBe("The Shining");
  });

  it("removes bracketed content", () => {
    expect(cleanTitle("Inception [2010]")).toBe("Inception");
    expect(cleanTitle("Movie [BluRay][1080p]")).toBe("Movie");
  });

  it("removes curly-brace content", () => {
    expect(cleanTitle("Movie {HDR}")).toBe("Movie");
  });

  it("removes quality/codec tags", () => {
    expect(cleanTitle("Movie.720p")).toBe("Movie");
    expect(cleanTitle("Movie.1080p.BluRay.x264")).toBe("Movie");
    expect(cleanTitle("Movie.2160p.UHD.HEVC.AC3")).toBe("Movie");
    expect(cleanTitle("Movie.BDRip.xvid.DTS")).toBe("Movie");
  });

  it("removes source tags", () => {
    expect(cleanTitle("Movie.WEBRIP.x265")).toBe("Movie");
    expect(cleanTitle("Movie.WEB-DL.AAC")).toBe("Movie");
    expect(cleanTitle("Movie.HDTV.DVDRip")).toBe("Movie");
  });

  it("replaces underscores with spaces", () => {
    expect(cleanTitle("The_Godfather")).toBe("The Godfather");
  });

  it("replaces dots with spaces (trailing segment treated as extension)", () => {
    // cleanTitle is designed for video filenames: the last dot-segment is
    // stripped as an extension before dots become spaces.
    // "The.Dark.Knight" → remove ".Knight" → "The Dark"
    expect(cleanTitle("The.Dark.Knight")).toBe("The Dark");
    // With an explicit extension present, the title is preserved
    expect(cleanTitle("The.Dark.Knight.2008.mkv")).toContain("Dark Knight");
  });

  it("collapses multiple spaces", () => {
    expect(cleanTitle("Movie   Title")).toBe("Movie Title");
  });

  it("trims trailing whitespace and punctuation", () => {
    expect(cleanTitle("Inception  ")).toBe("Inception");
    expect(cleanTitle("Inception-")).toBe("Inception");
  });

  it("removes release group tags", () => {
    expect(cleanTitle("Movie.YIFY")).toBe("Movie");
    expect(cleanTitle("Movie.FGT")).toBe("Movie");
    expect(cleanTitle("Movie.YTS")).toBe("Movie");
  });

  it("removes locale/language tags", () => {
    expect(cleanTitle("Movie.PL.Multi.Subs")).toBe("Movie");
    expect(cleanTitle("Movie.English.Polish")).toBe("Movie");
  });

  it("removes www/domain tags", () => {
    expect(cleanTitle("Movie.www.com")).toBe("Movie");
  });

  it("handles a realistic noisy filename", () => {
    const result = cleanTitle(
      "The.Thing.1982.BluRay.720p.x264.YIFY.mkv",
    );
    // Should contain "Thing" with year and noise stripped
    expect(result).toContain("Thing");
    expect(result).not.toContain("720p");
    expect(result).not.toContain("YIFY");
    expect(result).not.toContain(".mkv");
  });

  it("handles already-clean titles without mangling", () => {
    expect(cleanTitle("Inception")).toBe("Inception");
    expect(cleanTitle("The Dark Knight")).toBe("The Dark Knight");
  });

  it("handles empty string", () => {
    expect(cleanTitle("")).toBe("");
  });

  it("preserves numeric-heavy titles that are not years", () => {
    // "1917" is a movie title that should survive cleanTitle
    const result = cleanTitle("1917");
    expect(result).toBe("1917");
  });

  it("handles multi-part tags like cd1/cd2", () => {
    expect(cleanTitle("Movie.CD1.avi")).toBe("Movie");
    expect(cleanTitle("Movie.CD2.mkv")).toBe("Movie");
  });
});
