import type { StandardizeJob } from "@/lib/types";

/** How long a finished job stays readable, so reopening the movie shows how it ended. */
export const FINISHED_JOB_TTL_MS = 5 * 60 * 1000;

// On globalThis: Next can load a route module more than once (dev reloads, and
// the GET and POST handlers must see the same map).
const store = globalThis as typeof globalThis & {
  __filmpickStandardizeJobs?: Map<number, StandardizeJob>;
};
const jobs = (store.__filmpickStandardizeJobs ??= new Map());

export function getStandardizeJob(
  movieId: number,
  now = Date.now(),
): StandardizeJob | null {
  const job = jobs.get(movieId);
  if (!job) return null;
  if (job.finishedAt !== null && now - job.finishedAt > FINISHED_JOB_TTL_MS) {
    jobs.delete(movieId);
    return null;
  }
  return job;
}

/** Starts tracking a standardize; returns null when one is already running for this movie. */
export function startStandardizeJob(movieId: number): StandardizeJob | null {
  if (getStandardizeJob(movieId)?.status === "running") return null;
  const job: StandardizeJob = {
    status: "running",
    startedAt: Date.now(),
    finishedAt: null,
    bytesDone: 0,
    bytesTotal: 0,
    result: null,
  };
  jobs.set(movieId, job);
  return job;
}

export function finishStandardizeJob(
  movieId: number,
  ok: boolean,
  result: Record<string, unknown> | null,
): void {
  const job = jobs.get(movieId);
  if (!job) return;
  job.status = ok ? "done" : "error";
  job.finishedAt = Date.now();
  if (ok) job.bytesDone = job.bytesTotal;
  job.result = result;
}

export function clearStandardizeJobs(): void {
  jobs.clear();
}
