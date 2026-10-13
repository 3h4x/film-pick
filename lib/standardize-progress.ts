import type { StandardizeJob } from "@/lib/types";

export interface StandardizeProgressView {
  /** 0-100, or null while the size is not known yet. */
  percent: number | null;
  /** e.g. "1.2 / 4.5 GB" */
  sizeLabel: string | null;
  /** e.g. "2:05 elapsed" */
  elapsedLabel: string;
  /** e.g. "about 3:10 left", once there is a rate to go by. */
  remainingLabel: string | null;
}

const GB = 1024 ** 3;
const MB = 1024 ** 2;

function formatSize(bytes: number, unit: number): string {
  return (bytes / unit).toFixed(unit === GB ? 1 : 0);
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function describeStandardizeProgress(
  job: Pick<StandardizeJob, "startedAt" | "bytesDone" | "bytesTotal"> &
    Partial<Pick<StandardizeJob, "phaseStartedAt">>,
  now = Date.now(),
): StandardizeProgressView {
  const elapsed = now - job.startedAt;
  // The remaining time comes from this phase's own rate: a subtitle rewrite
  // before the move restarts bytesDone at 0.
  const phaseElapsed = now - (job.phaseStartedAt ?? job.startedAt);
  const elapsedLabel = `${formatDuration(elapsed)} elapsed`;
  if (job.bytesTotal <= 0) {
    return { percent: null, sizeLabel: null, elapsedLabel, remainingLabel: null };
  }

  const done = Math.min(job.bytesDone, job.bytesTotal);
  const percent = Math.floor((done / job.bytesTotal) * 100);
  const unit = job.bytesTotal >= GB ? GB : MB;
  const sizeLabel = `${formatSize(done, unit)} / ${formatSize(job.bytesTotal, unit)} ${unit === GB ? "GB" : "MB"}`;

  // Needs a few seconds of copying before the rate means anything.
  let remainingLabel: string | null = null;
  if (done > 0 && done < job.bytesTotal && phaseElapsed >= 3000) {
    const remainingMs = ((job.bytesTotal - done) / done) * phaseElapsed;
    remainingLabel = `about ${formatDuration(remainingMs)} left`;
  }

  return { percent, sizeLabel, elapsedLabel, remainingLabel };
}
