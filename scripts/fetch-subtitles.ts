/**
 * Download Polish subtitles for every video under a directory that has none,
 * saving `<video name>.srt` next to each file. Works without the app or its DB:
 * titles come from the filenames, so OpenSubtitles falls back to a name search
 * (the in-app button also knows the IMDb id and matches better).
 *
 * Usage: [eval "$(bioenv load)" &&] pnpm dlx tsx scripts/fetch-subtitles.ts <dir> [--replace]
 *   --replace  also re-download for videos that already have subtitles
 * OPENSUBTITLES_API_KEY (+ USERNAME/PASSWORD) enables the OpenSubtitles fallback.
 */

import { scanDirectoryGenerator } from "@/lib/scanner";
import { downloadSubtitle } from "@/lib/subtitle-download";
import { isOpenSubtitlesConfigured } from "@/lib/opensubtitles";

const args = process.argv.slice(2);
const replace = args.includes("--replace");
const dir = args.find((arg) => !arg.startsWith("--"));

if (!dir) {
  console.error("Usage: pnpm dlx tsx scripts/fetch-subtitles.ts <dir> [--replace]");
  process.exit(1);
}

async function main(root: string) {
  if (!isOpenSubtitlesConfigured()) {
    console.log("OPENSUBTITLES_API_KEY not set: NapiProjekt only.\n");
  }
  const totals = { downloaded: 0, not_found: 0, exists: 0, no_file: 0, error: 0 };
  for (const file of scanDirectoryGenerator(root)) {
    const result = await downloadSubtitle(
      { filePath: file.filePath, title: file.parsedTitle, year: file.parsedYear },
      { replace },
    );
    totals[result.status]++;
    if (result.status === "exists") continue;
    const detail =
      result.status === "downloaded"
        ? `${result.provider}${result.hashMatch ? "" : ", by title: check sync"} -> ${result.fileName}`
        : result.status === "error"
          ? result.error
          : result.status;
    console.log(`${file.filename}: ${detail}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.log(
    `\nDownloaded ${totals.downloaded}, not found ${totals.not_found}, ` +
      `already had ${totals.exists}, failed ${totals.error}.`,
  );
}

main(dir).catch((error) => {
  console.error(error);
  process.exit(1);
});
