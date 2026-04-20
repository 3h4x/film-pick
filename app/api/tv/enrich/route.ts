import { searchTmdb } from "@/lib/tmdb";

interface EnrichResult {
  rating: number | null;
  year: number | null;
}

const cache = new Map<string, EnrichResult>();

export async function POST(request: Request) {
  const { titles } = (await request.json()) as { titles: string[] };

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
