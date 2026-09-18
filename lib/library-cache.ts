import type { Movie } from "@/lib/types";

const DB_NAME = "filmpick-cache";
const STORE = "kv";
const KEY = "library";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// The cache is a pure optimisation: every failure (private mode, quota,
// missing IndexedDB) degrades to "no cache" rather than surfacing an error.
export async function readLibraryCache(): Promise<Movie[] | null> {
  try {
    const db = await openDb();
    return await new Promise<Movie[] | null>((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        db.close();
        resolve(Array.isArray(req.result) ? (req.result as Movie[]) : null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

export async function writeLibraryCache(movies: Movie[]): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(movies, KEY);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  } catch {
    // ignore
  }
}
