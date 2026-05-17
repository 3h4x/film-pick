import { getTmdbHealth } from "@/lib/tmdb";

export async function GET() {
  return Response.json(getTmdbHealth());
}
