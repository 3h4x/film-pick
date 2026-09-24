import crypto from "crypto";
import fs from "fs/promises";

// NapiProjekt identifies a video by the MD5 of its first 10 MiB — nothing else.
// A hit therefore means the subtitle was timed against this exact release; a
// home-made DVD/VHS rip has a hash nobody else shares and will simply miss.
const HASH_BYTES = 10 * 1024 * 1024;
const API_URL = "https://napiprojekt.pl/api/api-napiprojekt3.php";
const TIMEOUT_MS = 20000;

export async function napiprojektHash(filePath: string): Promise<string> {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(HASH_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HASH_BYTES, 0);
    return crypto
      .createHash("md5")
      .update(buffer.subarray(0, bytesRead))
      .digest("hex");
  } finally {
    await handle.close();
  }
}

/**
 * Fetch the subtitle NapiProjekt has for a file hash. Returns the raw bytes —
 * often MicroDVD regardless of what anyone calls it — or null when there is
 * none. The response is XML with the subtitle base64-encoded in a CDATA block;
 * a miss is a `<result>` without `<status>success</status>`.
 */
export async function fetchNapiprojektSubtitle(
  hash: string,
  language = "PL",
): Promise<Buffer | null> {
  const body = new URLSearchParams({
    mode: "1",
    client: "NapiProjektPython",
    client_ver: "0.1",
    downloaded_subtitles_id: hash,
    downloaded_subtitles_txt: "1",
    downloaded_subtitles_lang: language,
  });
  const res = await fetch(API_URL, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`NapiProjekt HTTP ${res.status}`);
  const xml = await res.text();
  if (!/<status>\s*success\s*<\/status>/.test(xml)) return null;
  const match = xml.match(/<content>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/content>/);
  if (!match) return null;
  const content = Buffer.from(match[1].trim(), "base64");
  return content.length > 0 ? content : null;
}
