import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import {
  downloadMissingSubtitles,
  type BulkSubtitleEvent,
} from "@/lib/subtitle-download";
import { getErrorMessage } from "@/lib/utils";

// One library-wide run at a time: two would race on the same files and double
// the load on the providers.
let running = false;

/** Fetch subtitles for every movie file that has none. Streams NDJSON progress. */
export async function POST(request: NextRequest) {
  const limited = rateLimit(request, "mutation");
  if (limited) return limited;
  if (running) {
    return Response.json(
      { error: "A subtitle download is already running" },
      { status: 409 },
    );
  }
  running = true;
  const db = getDb();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // The client may close the page mid-run; the work should still finish.
      let clientGone = false;
      function send(event: BulkSubtitleEvent | { type: "error"; error: string }) {
        if (clientGone) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          clientGone = true;
        }
      }
      try {
        await downloadMissingSubtitles(db, send);
      } catch (error) {
        console.error("[Subtitles] Bulk download failed:", error);
        send({ type: "error", error: getErrorMessage(error) });
      } finally {
        running = false;
        if (!clientGone) {
          try {
            controller.close();
          } catch {
            // already closed by a disconnect
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}
