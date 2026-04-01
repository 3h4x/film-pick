import fs from "fs";
import path from "path";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".avi", ".wmv", ".m4v", ".mov", ".flv", ".webm"]);

export interface ScannedFile {
  filePath: string;
  parsedTitle: string;
  parsedYear: number | null;
}

export function scanDirectory(dirPath: string): ScannedFile[] {
  const results: ScannedFile[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          const { title, year } = parseFilename(entry.name);
          if (title) {
            results.push({ filePath: fullPath, parsedTitle: title, parsedYear: year });
          }
        }
      }
    }
  }

  walk(dirPath);
  return results;
}

export function parseFilename(filename: string): { title: string; year: number | null } {
  // Remove extension
  let name = filename.replace(/\.[^.]+$/, "");

  // Try to extract year in parentheses: "Movie Name (2020)"
  let year: number | null = null;
  const parenYear = name.match(/\((\d{4})\)/);
  if (parenYear) {
    year = parseInt(parenYear[1], 10);
    name = name.replace(/\(\d{4}\)/, "");
  }

  // Try to extract year without parens: "Movie Name 2020" or "Movie.Name.2020"
  if (!year) {
    const bareYear = name.match(/[\.\s_-](\d{4})(?:[\.\s_-]|$)/);
    if (bareYear) {
      const y = parseInt(bareYear[1], 10);
      if (y >= 1900 && y <= 2099) {
        year = y;
        name = name.substring(0, bareYear.index);
      }
    }
  }

  // Clean up common release tags
  name = name
    .replace(/\b(720p|1080p|2160p|4k|uhd|bluray|blu-ray|brrip|bdrip|webrip|web-dl|hdtv|dvdrip|x264|x265|h264|h265|hevc|aac|ac3|dts|remux|proper|repack)\b/gi, "")
    .replace(/[\.\s_-]+/g, " ")
    .trim();

  // Remove trailing dashes/dots
  name = name.replace(/[\s\-\.]+$/, "").trim();

  return { title: name, year };
}
