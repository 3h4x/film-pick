import { describe, expect, it } from "vitest";
import { describeSubtitleCheck, subtitleCheckFromRow } from "@/lib/subtitle-check";

const AT = Date.UTC(2026, 9, 3, 12, 0) / 1000;

describe("subtitle check description", () => {
  it("says a film was never looked up", () => {
    expect(describeSubtitleCheck(null)).toMatch(/Not looked up yet/);
  });

  it("says nothing exists yet, which providers were asked, and that it retries", () => {
    const text = describeSubtitleCheck({ at: AT, status: "not_found", detail: "napiprojekt,opensubtitles" });
    expect(text).toMatch(/^Last checked 3 Oct 2026, \d\d:\d\d: no Polish subtitles on NapiProjekt or OpenSubtitles yet\./);
    expect(text).toMatch(/every 7 days/);
  });

  it("names the provider of a download and flags a title match", () => {
    expect(describeSubtitleCheck({ at: AT, status: "downloaded", detail: "napiprojekt" })).toMatch(
      /^Downloaded from NapiProjekt on 3 Oct 2026, \d\d:\d\d\.$/,
    );
    expect(describeSubtitleCheck({ at: AT, status: "downloaded", detail: "opensubtitles:title" })).toMatch(
      /OpenSubtitles .*matched by title/,
    );
  });

  it("explains errors and an unreachable file", () => {
    expect(describeSubtitleCheck({ at: AT, status: "error", detail: "HTTP 503" })).toMatch(/failed: HTTP 503\. Tried again tomorrow/);
    expect(describeSubtitleCheck({ at: AT, status: "no_file", detail: null })).toMatch(/not reachable/);
  });

  it("reads the check from a movie row", () => {
    expect(subtitleCheckFromRow({})).toBeNull();
    expect(
      subtitleCheckFromRow({ subtitles_checked_at: AT, subtitles_check_status: "exists", subtitles_check_detail: null }),
    ).toEqual({ at: AT, status: "exists", detail: null });
  });
});
