import { boundedInteger, errorPayload, getLegacyAssistantResponse, type MarketDataEnv } from "./market-query";

const HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=20, stale-while-revalidate=20",
  "X-Royal-Exchange-API-Version": "1.0",
  "X-Royal-Exchange-Simulation": "true",
};

export async function handleAssistantApi(request: Request, env: MarketDataEnv) {
  const requestId = crypto.randomUUID();
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405, headers: { ...HEADERS, Allow: "GET, OPTIONS" } });

  const url = new URL(request.url);
  try {
    const body = await getLegacyAssistantResponse(env, {
      identifier: url.searchParams.get("identifier")?.trim() || undefined,
      query: url.searchParams.get("query")?.trim() || undefined,
      historyPoints: boundedInteger(url.searchParams.get("historyPoints"), 6, 1, 24),
      matchLimit: boundedInteger(url.searchParams.get("limit"), 10, 1, 20),
    }, requestId);
    return Response.json(body, { headers: { ...HEADERS, "X-Request-Id": requestId } });
  } catch (error) {
    const result = errorPayload(error, requestId);
    return Response.json(result.body, { status: result.status, headers: { ...HEADERS, "X-Request-Id": requestId } });
  }
}
