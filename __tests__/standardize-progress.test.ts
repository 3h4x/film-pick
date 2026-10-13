import { describe, it, expect } from "vitest";
import { describeStandardizeProgress } from "@/lib/standardize-progress";

const GB = 1024 ** 3;

describe("describeStandardizeProgress", () => {
  it("has no percentage before the size is known", () => {
    const view = describeStandardizeProgress(
      { startedAt: 0, bytesDone: 0, bytesTotal: 0 },
      5000,
    );
    expect(view).toEqual({
      percent: null,
      sizeLabel: null,
      elapsedLabel: "0:05 elapsed",
      remainingLabel: null,
    });
  });

  it("shows GB, percent and a remaining-time estimate from the rate so far", () => {
    // 1 of 4 GB in 60s -> 3 GB left at the same rate = 180s.
    const view = describeStandardizeProgress(
      { startedAt: 0, bytesDone: 1 * GB, bytesTotal: 4 * GB },
      60_000,
    );
    expect(view.percent).toBe(25);
    expect(view.sizeLabel).toBe("1.0 / 4.0 GB");
    expect(view.elapsedLabel).toBe("1:00 elapsed");
    expect(view.remainingLabel).toBe("about 3:00 left");
  });

  it("uses MB for small files and gives no estimate in the first seconds", () => {
    const view = describeStandardizeProgress(
      { startedAt: 0, bytesDone: 100 * 1024 ** 2, bytesTotal: 700 * 1024 ** 2 },
      1000,
    );
    expect(view.sizeLabel).toBe("100 / 700 MB");
    expect(view.remainingLabel).toBeNull();
  });

  it("caps at 100% and stops estimating when everything is moved", () => {
    const view = describeStandardizeProgress(
      { startedAt: 0, bytesDone: 5 * GB, bytesTotal: 4 * GB },
      60_000,
    );
    expect(view.percent).toBe(100);
    expect(view.remainingLabel).toBeNull();
  });
});
