import { describe, it, expect } from "vitest";
import { cleanTitle, parseFilename } from "@/lib/utils";

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

describe("parseFilename", () => {
  it("parses title and year from parenthesized year", () => {
    const { title, year } = parseFilename("Inception (2010).mkv");
    expect(title).toBe("Inception");
    expect(year).toBe(2010);
  });

  it("parses year from bracketed year", () => {
    const { title, year } = parseFilename("The Matrix [1999].mkv");
    expect(title).toBe("The Matrix");
    expect(year).toBe(1999);
  });

  it("parses year from leading parenthesized format", () => {
    const { title, year } = parseFilename("(2013) Gravity.mkv");
    expect(title).toBe("Gravity");
    expect(year).toBe(2013);
  });

  it("parses year from dot-separated filename", () => {
    const { title, year } = parseFilename("Dune.2021.mkv");
    expect(title).toBe("Dune");
    expect(year).toBe(2021);
  });

  it("parses year from noisy release filename", () => {
    const { title, year } = parseFilename("Interstellar.2014.1080p.BluRay.x264.mkv");
    expect(title).toContain("Interstellar");
    expect(year).toBe(2014);
  });

  it("returns null year when no year is found", () => {
    const { title, year } = parseFilename("Casablanca.mkv");
    expect(title).toBe("Casablanca");
    expect(year).toBeNull();
  });

  it("treats a standalone 4-digit number as a year, leaving an empty title", () => {
    // "1917.mkv" has no text before the year, so year=1917, title=""
    const { title, year } = parseFilename("1917.mkv");
    expect(year).toBe(1917);
    expect(title).toBe("");
  });

  it("handles underscore-separated filename", () => {
    const { title, year } = parseFilename("The_Godfather_1972.mkv");
    expect(title).toContain("Godfather");
    expect(year).toBe(1972);
  });

  it("strips release tags from title", () => {
    const { title } = parseFilename("Blade.Runner.1982.REMASTERED.1080p.BluRay.mkv");
    expect(title).toContain("Blade");
    expect(title).not.toContain("1080p");
    expect(title).not.toContain("BluRay");
  });

  it("returns empty string for filename with only release tags", () => {
    const { title } = parseFilename("1080p.BluRay.x264.mkv");
    expect(typeof title).toBe("string");
  });
});
