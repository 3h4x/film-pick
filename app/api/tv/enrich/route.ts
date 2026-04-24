import { searchTmdb } from "@/lib/tmdb";

interface EnrichResult {
  rating: number | null;
  year: number | null;
}

const cache = new Map<string, EnrichResult>();

export async function POST(request: Request) {
  const body = await request.json();
  const { titles } = body as { titles: unknown };

  if (!Array.isArray(titles)) {
    return Response.json({ error: "titles must be an array" }, { status: 400 });
  }
  if (titles.length > 500) {
    return Response.json({ error: "too many titles (max 500)" }, { status: 400 });
  }
  if (titles.some((t) => typeof t !== "string")) {
    return Response.json({ error: "all titles must be strings" }, { status: 400 });
  }

  const result: Record<string, EnrichResult> = {};

  await Promise.all(
    titles.map(async (title: string) => {
      if (cache.has(title)) {
        result[title] = cache.get(title)!;
        return;
      }
      try {
        const hits = await searchTmdb(title);
        const top = hits[0];
        const data: EnrichResult = top
          ? {
              rating: top.rating ?? null,
              year: top.year ?? null,
            }
          : { rating: null, year: null };
        cache.set(title, data);
        result[title] = data;
      } catch {
        result[title] = { rating: null, year: null };
      }
    }),
  );

  return Response.json(result);
}
