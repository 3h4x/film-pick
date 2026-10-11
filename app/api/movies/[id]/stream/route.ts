import { NextRequest, NextResponse } from "next/server";
import { getDb, Movie } from "@/lib/db";
import { getErrorMessage } from "@/lib/utils";
import {
  DEFAULT_FPS,
  decodeSubtitleBuffer,
  detectSubtitleFormat,
  normalizeSubtitle,
  readMicroDvdFps,
} from "@/lib/subtitles";
import { probeFps } from "@/lib/ffprobe";
import { buildRemuxArgs, shiftVttCues } from "@/lib/playback";
import { spawn } from "child_process";
import { Readable } from "stream";
import fs from "fs";
import { stat } from "fs/promises";
import path from "path";

const SRT_TIMESTAMP_RE = /(\d{2}:\d{2}:\d{2}),(\d{3})/g;

// Each remux is an ffmpeg process; a small home server copes with a couple at once.
const MAX_REMUX_STREAMS = 2;
let activeRemuxStreams = 0;

function remuxResponse(
  req: NextRequest,
  filePath: string,
  videoCodec: string | undefined,
): NextResponse {
  if (activeRemuxStreams >= MAX_REMUX_STREAMS) {
    return new NextResponse("Too many compatibility streams, try again shortly", {
      status: 503,
    });
  }
  const start = parseFloat(req.nextUrl.searchParams.get("start") || "0");
  const child = spawn("ffmpeg", buildRemuxArgs(filePath, start, videoCodec), {
    stdio: ["ignore", "pipe", "pipe"],
  });
  activeRemuxStreams++;

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    if (stderr.length < 4000) stderr += chunk.toString();
  });
  const stop = () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  };
  // The player drops the connection on every seek and on close: end ffmpeg with it.
  req.signal.addEventListener("abort", stop, { once: true });
  child.on("error", (err) => console.error("[Stream remux] ffmpeg failed to start", err));
  child.on("close", (code, signal) => {
    activeRemuxStreams--;
    req.signal.removeEventListener("abort", stop);
    if (code && !signal && !req.signal.aborted) {
      console.error(`[Stream remux] ffmpeg exited with ${code}: ${stderr.trim()}`);
    }
  });

  // Readable.toWeb keeps backpressure: ffmpeg is paused while the client is not reading,
  // so a slow player never buffers a whole film in memory.
  const body = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>;
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "video/mp4", "Cache-Control": "no-store" },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: movieId } = await params;

  try {
    const db = getDb();
    const movie = db
      .prepare("SELECT * FROM movies WHERE id = ?")
      .get(movieId) as Movie | undefined;
    if (!movie || !movie.file_path) {
      return new NextResponse("Movie or file path not found", { status: 404 });
    }

    const filePath = movie.file_path;
    const extraFiles = movie.extra_files ? JSON.parse(movie.extra_files) : [];
    const part = parseInt(req.nextUrl.searchParams.get("part") || "0", 10);
    const activeFilePath = part === 0 ? filePath : extraFiles[part - 1];

    if (!activeFilePath) {
      return new NextResponse("File part not found", { status: 404 });
    }

    const subName = req.nextUrl.searchParams.get("sub");

    if (subName) {
      const movieDir = path.dirname(activeFilePath);
      const subPath = path.join(movieDir, subName);
      // Prevent path traversal: resolved subtitle must stay within the movie's directory
      if (!path.resolve(subPath).startsWith(path.resolve(movieDir) + path.sep)) {
        return new NextResponse("Invalid subtitle path", { status: 400 });
      }
      let raw: Buffer;
      try {
        // Bytes, not "utf-8": much of a real library is windows-1250 and would
        // decode straight to U+FFFD.
        raw = await fs.promises.readFile(subPath);
      } catch {
        return new NextResponse("Subtitle not found", { status: 404 });
      }

      // A remux stream started at `shift` seconds restarts its timeline at 0.
      const shift = parseFloat(req.nextUrl.searchParams.get("shift") || "0");
      const vttResponse = (body: string) =>
        new NextResponse(shiftVttCues(body, shift), {
          headers: {
            "Content-Type": "text/vtt",
            "Content-Disposition": "inline",
          },
        });

      // Never trust the extension here either: `.srt` routinely holds MicroDVD and
      // standardize deliberately names such payloads `.sub`.
      const { text } = decodeSubtitleBuffer(raw);
      const format = detectSubtitleFormat(text);

      // Already WebVTT — only the encoding ever needed fixing.
      if (format === "vtt") return vttResponse(text);

      // MicroDVD counts frames, so it needs the movie's real rate; everything else
      // is time-based and never touches fps, so skip the ffprobe spawn.
      const fps =
        format === "microdvd" && readMicroDvdFps(text) === null
          ? await probeFps(activeFilePath)
          : DEFAULT_FPS;

      const normalized = normalizeSubtitle(raw, { fps });
      if (!normalized.converted) {
        // ASS/SSA or unparsable — a <track> element cannot render it either way.
        // Say so instead of mislabelling the bytes as WebVTT.
        return new NextResponse("Unsupported subtitle format", { status: 415 });
      }

      return vttResponse(
        "WEBVTT\n\n" +
          normalized.content.toString("utf8").replace(SRT_TIMESTAMP_RE, "$1.$2"),
      );
    }

    if (req.nextUrl.searchParams.get("mode") === "remux") {
      let videoCodec: string | undefined;
      try {
        const meta = JSON.parse(movie.video_metadata || "{}") as {
          video?: { codec?: string };
        };
        videoCodec = meta.video?.codec;
      } catch {
        videoCodec = undefined;
      }
      return remuxResponse(req, activeFilePath, videoCodec);
    }

    const fileStat = await stat(activeFilePath);
    const range = req.headers.get("range");

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileStat.size - 1;

      if (start >= fileStat.size) {
        return new NextResponse("Requested range not satisfiable", {
          status: 416,
        });
      }

      const chunksize = end - start + 1;
      const file = fs.createReadStream(activeFilePath, { start, end });
      file.on?.("error", (err) => console.error("[Stream API Error]", err));

      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunksize),
        "Content-Type": activeFilePath.toLowerCase().endsWith(".mkv")
          ? "video/x-matroska"
          : "video/mp4",
      };

      return new NextResponse(file as unknown as BodyInit, {
        status: 206,
        headers: head,
      });
    } else {
      const head = {
        "Content-Length": String(fileStat.size),
        "Content-Type": activeFilePath.toLowerCase().endsWith(".mkv")
          ? "video/x-matroska"
          : "video/mp4",
      };
      const file = fs.createReadStream(activeFilePath);
      file.on?.("error", (err) => console.error("[Stream API Error]", err));
      return new NextResponse(file as unknown as BodyInit, {
        status: 200,
        headers: head,
      });
    }
  } catch (error) {
    console.error("[Stream API Error]", error);
    return new NextResponse(getErrorMessage(error), { status: 500 });
  }
}
