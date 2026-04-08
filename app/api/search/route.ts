import { NextRequest } from "next/server";
import { searchTmdb } from "@/lib/tmdb";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") || "";

  if (!query.trim()) {
    return Response.json([]);
  }

  const results = await searchTmdb(query);
  return Response.json(results);
}
