import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getStandardizeJob } from "@/lib/standardize-jobs";
import { runStandardizeJob } from "@/lib/standardize";

/**
 * Progress of this movie's standardize, polled by the movie detail. Moving across
 * shares copies the whole file and can take minutes; the detail can be closed
 * and reopened meanwhile and must still show the move running (and not offer a
 * second one), then how it ended.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = getStandardizeJob(parseInt(id, 10));
  return Response.json(job ?? { status: "idle" });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "mutation");
  if (limited) return limited;
  const { id } = await params;
  const movieId = parseInt(id, 10);
  const outcome = await runStandardizeJob(getDb(), movieId, {
    deleteMissing: request.nextUrl.searchParams.get("delete_missing") === "true",
  });
  // A second click must not start a second move of the same file while the
  // first is still copying.
  if (!outcome) {
    return Response.json(
      {
        error:
          "Already moving this movie's file. Large files between shares can take several minutes; reopen the movie later to see the result.",
      },
      { status: 409 },
    );
  }
  return Response.json(outcome.body, { status: outcome.status });
}
