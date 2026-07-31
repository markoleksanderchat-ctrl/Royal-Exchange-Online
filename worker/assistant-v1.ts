import {
  boundedInteger,
  compareIssuers,
  errorPayload,
  findMinecraftWares,
  getIssuer,
  getNotices,
  getOverview,
  parsePeriod,
  searchMarket,
  type MarketDataEnv,
} from "./market-query";

const HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=20, stale-while-revalidate=20",
  "X-Royal-Exchange-API-Version": "1.0",
  "X-Royal-Exchange-Simulation": "true",
};

function requireQuery(url: URL, name: string, maximumLength = 80) {
  const value = url.searchParams.get(name)?.trim();
  if (!value) throw new Error(`Missing required query parameter: ${name}`);
  if (value.length > maximumLength) throw new Error(`${name} must be at most ${maximumLength} characters.`);
  return value;
}

function required(value: string | undefined, name: string, maximumLength = 100) {
  if (!value?.trim()) throw new Error(`Missing required path parameter: ${name}`);
  if (value.length > maximumLength) throw new Error(`${name} must be at most ${maximumLength} characters.`);
  return value.trim();
}

function badRequest(message: string, requestId: string) {
  return Response.json({
    meta: { apiVersion: "1.0", requestId, source: "https://royalexchange.net/", simulated: true },
    error: { code: "invalid_request", message },
  }, { status: 400, headers: { ...HEADERS, "X-Request-Id": requestId } });
}

export async function handleAssistantV1(request: Request, env: MarketDataEnv) {
  const requestId = crypto.randomUUID();
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== "GET") {
    return Response.json({
      meta: { apiVersion: "1.0", requestId, source: "https://royalexchange.net/", simulated: true },
      error: { code: "method_not_allowed", message: "Only GET is supported." },
    }, { status: 405, headers: { ...HEADERS, Allow: "GET, OPTIONS", "X-Request-Id": requestId } });
  }

  const url = new URL(request.url);
  const relativePath = url.pathname.slice("/api/v1/".length);
  try {
    let data: Record<string, unknown>;
    if (relativePath === "overview") {
      data = await getOverview(env, boundedInteger(url.searchParams.get("moverLimit"), 5, 1, 10), requestId);
    } else if (relativePath === "search") {
      data = await searchMarket(env, requireQuery(url, "query"), boundedInteger(url.searchParams.get("limit"), 10, 1, 20), requestId);
    } else if (relativePath.startsWith("issuers/")) {
      data = await getIssuer(
        env,
        required(decodeURIComponent(relativePath.slice("issuers/".length)), "identifier"),
        parsePeriod(url.searchParams.get("period")),
        boundedInteger(url.searchParams.get("historyPoints"), 48, 1, 120),
        requestId,
      );
    } else if (relativePath === "compare") {
      const identifiers = requireQuery(url, "identifiers", 605).split(",").map((value) => value.trim()).filter(Boolean);
      if (identifiers.length < 2 || identifiers.length > 6) return badRequest("identifiers must contain 2 to 6 comma-separated tickers.", requestId);
      if (identifiers.some((identifier) => identifier.length > 100)) return badRequest("Each identifier must be at most 100 characters.", requestId);
      data = await compareIssuers(env, identifiers, requestId);
    } else if (relativePath === "notices") {
      data = await getNotices(env, boundedInteger(url.searchParams.get("moverLimit"), 5, 1, 10), requestId);
    } else if (relativePath === "wares") {
      data = await findMinecraftWares(env, requireQuery(url, "query"), boundedInteger(url.searchParams.get("limit"), 10, 1, 20), requestId);
    } else {
      return Response.json({
        meta: { apiVersion: "1.0", requestId, source: "https://royalexchange.net/", simulated: true },
        error: { code: "not_found", message: "No Royal Exchange API operation exists at this path." },
      }, { status: 404, headers: { ...HEADERS, "X-Request-Id": requestId } });
    }
    return Response.json(data, { headers: { ...HEADERS, "X-Request-Id": requestId } });
  } catch (error) {
    if (error instanceof URIError || (error instanceof Error && (error.message.startsWith("Missing required") || error.message.includes("must be at most")))) {
      return badRequest(error.message, requestId);
    }
    const result = errorPayload(error, requestId);
    return Response.json(result.body, { status: result.status, headers: { ...HEADERS, "X-Request-Id": requestId } });
  }
}
