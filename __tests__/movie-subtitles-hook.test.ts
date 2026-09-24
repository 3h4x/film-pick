import {
  describeSubtitleDownload,
  getSubtitleContextKey,
  upsertSubtitleTrack,
} from "@/components/movie-detail/useMovieSubtitles";
import {
  applySubtitleBulkEvent,
  INITIAL_SUBTITLE_BULK_STATE,
} from "@/lib/hooks/useSubtitleBulkDownload";
import type { SubtitleDownloadResult } from "@/lib/subtitle-download";
import { describe, expect, it } from "vitest";

describe("upsertSubtitleTrack", () => {
  const srt = { name: "Inception.srt", path: "/movies/Inception/Inception.srt" };
  const ass = { name: "Inception.ass", path: "/movies/Inception/Inception.ass" };

  it("appends a track that is not in the list yet", () => {
    expect(upsertSubtitleTrack([], srt)).toEqual([srt]);
    expect(upsertSubtitleTrack([srt], ass)).toEqual([srt, ass]);
  });

  it("replaces a re-uploaded track instead of listing it twice", () => {
    // The server overwrites the same path, so the list must not grow.
    const reuploaded = { name: "Inception.srt", path: srt.path };
    expect(upsertSubtitleTrack([srt], reuploaded)).toEqual([reuploaded]);
  });

  it("keeps the replaced track in its original position", () => {
    // Index-based React keys mean reordering would remount the <track> element.
    const reuploaded = { name: "Inception.srt", path: srt.path };
    expect(upsertSubtitleTrack([srt, ass], reuploaded)).toEqual([
      reuploaded,
      ass,
    ]);
  });
});

describe("getSubtitleContextKey", () => {
  it("changes when a persisted movie keeps the same id but gets a different file path", () => {
    const before = getSubtitleContextKey({
      movieId: 12,
      filePath: "/library/Old/Movie.mkv",
      isPersistedMovie: true,
    });
    const after = getSubtitleContextKey({
      movieId: 12,
      filePath: "/library/New/Movie.mkv",
      isPersistedMovie: true,
    });

    expect(after).not.toBe(before);
  });

  it("changes when a same-id movie loses its local file context", () => {
    const before = getSubtitleContextKey({
      movieId: 12,
      filePath: "/library/Movie/Movie.mkv",
      isPersistedMovie: true,
    });
    const after = getSubtitleContextKey({
      movieId: 12,
      filePath: null,
      isPersistedMovie: true,
    });

    expect(after).not.toBe(before);
  });

  it("changes when the persisted state changes for the same id and path", () => {
    const before = getSubtitleContextKey({
      movieId: 12,
      filePath: "/library/Movie/Movie.mkv",
      isPersistedMovie: true,
    });
    const after = getSubtitleContextKey({
      movieId: 12,
      filePath: "/library/Movie/Movie.mkv",
      isPersistedMovie: false,
    });

    expect(after).not.toBe(before);
  });
});

describe("describeSubtitleDownload", () => {
  it("confirms a hash match", () => {
    expect(
      describeSubtitleDownload({ provider: "napiprojekt", hashMatch: true }),
    ).toEqual({
      text: "Downloaded from NapiProjekt, matched to this exact file.",
      warn: false,
    });
  });

  it("warns that a title match may be out of sync", () => {
    const notice = describeSubtitleDownload({
      provider: "opensubtitles",
      hashMatch: false,
    });
    expect(notice.warn).toBe(true);
    expect(notice.text).toContain("OpenSubtitles");
    expect(notice.text).toContain("Timing may be off");
  });
});

describe("applySubtitleBulkEvent", () => {
  it("tallies progress and collects title matches", () => {
    let state = applySubtitleBulkEvent(
      { ...INITIAL_SUBTITLE_BULK_STATE, running: true },
      { type: "start", total: 3 },
    );
    const progress = (
      index: number,
      title: string,
      result: SubtitleDownloadResult,
    ) => ({ type: "progress", index, total: 3, movieId: index, title, result }) as const;
    state = applySubtitleBulkEvent(
      state,
      progress(1, "A", {
        status: "downloaded",
        provider: "opensubtitles",
        hashMatch: false,
        fileName: "A.srt",
        path: "/m/A.srt",
        format: "srt",
        converted: true,
        cueCount: 10,
      }),
    );
    state = applySubtitleBulkEvent(
      state,
      progress(2, "B", { status: "exists", existing: ["/m/B.srt"] }),
    );
    state = applySubtitleBulkEvent(state, progress(3, "C", { status: "not_found" }));
    expect(state).toMatchObject({
      total: 3,
      processed: 3,
      downloaded: 1,
      skipped: 1,
      notFound: 1,
      titleMatches: ["A"],
      running: true,
    });
    state = applySubtitleBulkEvent(state, {
      type: "done",
      downloaded: 1,
      notFound: 1,
      skipped: 1,
      errors: 0,
    });
    expect(state.running).toBe(false);
    expect(state.finished).toBe(true);
  });
});
