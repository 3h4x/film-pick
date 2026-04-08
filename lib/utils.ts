export function cleanTitle(title: string): string {
  return title
    .replace(/\.[^.]+$/, "") // Remove extension if present
    .replace(/\[.*?\]/g, " ") // Remove everything in brackets
    .replace(/\{.*?\}/g, " ") // Remove everything in curly braces
    .replace(
      /\b(720p|1080p|2160p|4k|uhd|bluray|blu-ray|brrip|bdrip|webrip|web-dl|hdtv|dvdrip|xvid|divx|x264|x265|h264|h265|hevc|aac|ac3|dts|remux|proper|repack|maxspeed|torentz|torrentz|3xforum|fxg|noir|flixflux|kingdom|galaxyrg|yify|fgt|psig|yts|ev|evo|hdrip|cd[1-2]|dvd|blurayrip)\b/gi,
      " ",
    )
    .replace(
      /\b(www|ro|com|net|org|pl|uk|co|osloskop|unseen|shoket|fxg|english|polish|multi|dual|subs)\b/gi,
      " ",
    )
    .replace(/[\.\s_-]+/g, " ")
    .replace(/[:;!?()[\]{}]/g, " ") // Remove common punctuation
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .replace(/[\s\-\.]+$/, "")
    .trim();
}

export function parseFilename(filename: string): {
  title: string;
  year: number | null;
} {
  // Remove extension
  let name = filename.replace(/\.[^.]+$/, "");

  // Try to extract year in parentheses at beginning: "(2013) Movie Name"
  let year: number | null = null;
  const startParenYear = name.match(/^\((\d{4})\)/);
  if (startParenYear) {
    const y = parseInt(startParenYear[1], 10);
    if (y >= 1900 && y <= 2099) {
      year = y;
      name = name.replace(/^\(\d{4}\)/, "");
    }
  }

  // Try to extract year in brackets: "[2010]"
  if (!year) {
    const bracketYear = name.match(/\[(\d{4})\]/);
    if (bracketYear) {
      const y = parseInt(bracketYear[1], 10);
      if (y >= 1900 && y <= 2099) {
        year = y;
        name = name.replace(/\[\d{4}\]/, "");
      }
    }
  }

  // Try to extract year in parentheses elsewhere: "Movie Name (2020)"
  if (!year) {
    const parenYear = name.match(/\((\d{4})\)/);
    if (parenYear) {
      const y = parseInt(parenYear[1], 10);
      if (y >= 1900 && y <= 2099) {
        year = y;
        name = name.replace(/\(\d{4}\)/, "");
      }
    }
  }

  // Try to extract year without parens: "Movie Name 2020" or "Movie.Name.2020"
  // ONLY if it's followed by a known tag or end of string, to avoid cutting names like "13 Tzameti" or "One Eight Seven"
  if (!year) {
    const bareYear = name.match(/(?:^|[\.\s_-])(\d{4})(?:[\.\s_-]|$)/);
    if (bareYear) {
      const y = parseInt(bareYear[1], 10);
      if (y >= 1900 && y <= 2099) {
        // Look ahead for known release tags or end of string
        const remaining = name
          .substring(bareYear.index! + bareYear[0].length)
          .toLowerCase();
        const hasTag =
          /\b(720p|1080p|2160p|bluray|dvdrip|xvid|webrip|web-dl|hdtv|x264|x265|aac|ac3)\b/i.test(
            remaining,
          );
        const isEnd = remaining.trim().length === 0;

        if (hasTag || isEnd) {
          year = y;
          const match = bareYear[0];
          const index = name.indexOf(match);
          name = name.substring(0, index);
        }
      }
    }
  }

  // Replace dots/underscores with spaces before cleaning (extension already removed)
  name = name.replace(/[\._]+/g, " ");
  // Clean up common release tags
  name = cleanTitle(name);

  return { title: name, year };
}
