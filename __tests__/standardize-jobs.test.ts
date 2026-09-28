import { describe, it, expect, afterEach } from "vitest";
import {
  FINISHED_JOB_TTL_MS,
  clearStandardizeJobs,
  finishStandardizeJob,
  getStandardizeJob,
  startStandardizeJob,
} from "@/lib/standardize-jobs";

describe("standardize jobs", () => {
  afterEach(() => {
    clearStandardizeJobs();
  });

  it("has no job for a movie that was never standardized", () => {
    expect(getStandardizeJob(1)).toBeNull();
  });

  it("refuses a second start while one is running", () => {
    expect(startStandardizeJob(1)?.status).toBe("running");
    expect(startStandardizeJob(1)).toBeNull();
    // Other movies are independent.
    expect(startStandardizeJob(2)?.status).toBe("running");
  });

  it("keeps the outcome after finishing, and allows a new start", () => {
    const job = startStandardizeJob(1)!;
    job.bytesTotal = 100;
    job.bytesDone = 40;
    finishStandardizeJob(1, true, { ok: true, newPath: "/mnt/library/A [2000]/A.mkv" });

    const done = getStandardizeJob(1)!;
    expect(done.status).toBe("done");
    expect(done.bytesDone).toBe(100);
    expect(done.result).toEqual({ ok: true, newPath: "/mnt/library/A [2000]/A.mkv" });
    expect(startStandardizeJob(1)?.status).toBe("running");
  });

  it("records a failure as error without claiming the bytes moved", () => {
    const job = startStandardizeJob(1)!;
    job.bytesTotal = 100;
    job.bytesDone = 40;
    finishStandardizeJob(1, false, { error: "disk full" });
    const failed = getStandardizeJob(1)!;
    expect(failed.status).toBe("error");
    expect(failed.bytesDone).toBe(40);
    expect(failed.result).toEqual({ error: "disk full" });
  });

  it("forgets a finished job after the TTL, never a running one", () => {
    startStandardizeJob(1);
    finishStandardizeJob(1, true, null);
    const finishedAt = getStandardizeJob(1)!.finishedAt!;
    expect(getStandardizeJob(1, finishedAt + FINISHED_JOB_TTL_MS + 1)).toBeNull();

    startStandardizeJob(2);
    expect(getStandardizeJob(2, Date.now() + 10 * FINISHED_JOB_TTL_MS)?.status).toBe("running");
  });
});
