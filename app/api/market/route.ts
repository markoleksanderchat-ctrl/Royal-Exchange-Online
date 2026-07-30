import { getMarketSnapshot } from "../../../lib/market";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getMarketSnapshot(), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=20, stale-while-revalidate=20",
      "X-Royal-Exchange-Mode": "autonomous-wall-clock",
      "X-Royal-Exchange-Simulation": "true",
      "X-Royal-Exchange-History": "unavailable",
    },
  });
}
