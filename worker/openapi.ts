const metaSchema = {
  type: "object",
  required: ["apiVersion", "requestId", "asOf", "dataMode", "degraded", "modelVersion", "modelStartedAt", "source", "simulated"],
  properties: {
    apiVersion: { type: "string", example: "1.0" },
    requestId: { type: "string", format: "uuid" },
    asOf: { type: "string", format: "date-time" },
    dataAgeSeconds: { type: ["integer", "null"] },
    dataMode: { type: "string", enum: ["recorded-ledger", "fallback-simulation"] },
    degraded: { type: "boolean" },
    modelVersion: { type: "string" },
    modelStartedAt: { type: ["string", "null"], format: "date-time" },
    recordedFrom: { type: ["string", "null"], format: "date-time" },
    recordedObservations: { type: "integer" },
    source: { type: "string", format: "uri" },
    simulated: { type: "boolean", const: true },
  },
} as const;

const companySchema = {
  type: "object",
  required: ["ticker", "name", "sector", "principalTrade", "priceCrowns", "bidCrowns", "askCrowns", "spreadCrowns", "changeCrowns", "changePercent", "volume", "matchedTrades"],
  properties: {
    ticker: { type: "string", example: "WIRE" },
    name: { type: "string" },
    sector: { type: "string" },
    principalTrade: { type: "string" },
    priceCrowns: { type: "number" },
    bidCrowns: { type: "number" },
    askCrowns: { type: "number" },
    spreadCrowns: { type: "number" },
    changeCrowns: { type: "number" },
    changePercent: { type: "number" },
    volume: { type: "integer" },
    matchedTrades: { type: "integer" },
  },
} as const;

const successResponse = (description: string, properties: Record<string, unknown>, required: string[]) => ({
  description,
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["meta", ...required],
        properties: { meta: { $ref: "#/components/schemas/ResponseMeta" }, ...properties },
      },
    },
  },
});

const errorResponse = {
  description: "Structured request or lookup error.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
};

export const ROYAL_EXCHANGE_OPENAPI = {
  openapi: "3.1.0",
  info: {
    title: "Royal Exchange ChatGPT API",
    version: "1.0.0",
    description: "Compact, public, strictly read-only access to the simulated Royal Exchange market. It cannot place trades or write Minecraft, gameplay, or market state.",
  },
  servers: [{ url: "https://royalexchange.net" }],
  paths: {
    "/api/v1/overview": {
      get: {
        operationId: "getRoyalExchangeOverview",
        summary: "Get the compact current market overview",
        description: "Use for broad questions about the composite, breadth, current notices, volume, or largest movers. Do not use it to look up every issuer.",
        parameters: [{ name: "moverLimit", in: "query", schema: { type: "integer", minimum: 1, maximum: 10, default: 5 } }],
        responses: { "200": successResponse("Current compact market overview.", { largestMoves: { type: "array", items: { $ref: "#/components/schemas/Company" } } }, ["largestMoves"]), "400": errorResponse },
      },
    },
    "/api/v1/search": {
      get: {
        operationId: "searchRoyalExchange",
        summary: "Search fictional Royal Exchange issuers",
        description: "Use when the user provides a company fragment, sector, trade, or ware but not an exact ticker.",
        parameters: [
          { name: "query", in: "query", required: true, schema: { type: "string", minLength: 1, maxLength: 80 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 20, default: 10 } },
        ],
        responses: { "200": successResponse("Matching issuers.", { query: { type: "string" }, matchCount: { type: "integer" }, matches: { type: "array", items: { $ref: "#/components/schemas/Company" } } }, ["query", "matchCount", "matches"]), "400": errorResponse },
      },
    },
    "/api/v1/issuers/{identifier}": {
      get: {
        operationId: "getRoyalExchangeIssuer",
        summary: "Get one issuer, lore, notices, and historical performance",
        description: "Use for an exact ticker or issuer after search. Returns server-calculated performance so ChatGPT should not estimate returns from chart points.",
        parameters: [
          { name: "identifier", in: "path", required: true, schema: { type: "string", minLength: 1, maxLength: 100 } },
          { name: "period", in: "query", schema: { type: "string", enum: ["1h", "6h", "24h", "7d", "30d", "all"], default: "24h" } },
          { name: "historyPoints", in: "query", schema: { type: "integer", minimum: 1, maximum: 576, default: 48 } },
        ],
        responses: { "200": successResponse("Issuer detail and performance.", { issuer: { type: "object", additionalProperties: true }, activeNotices: { type: "array", items: { type: "object", additionalProperties: true } } }, ["issuer", "activeNotices"]), "400": errorResponse, "404": errorResponse, "409": errorResponse },
      },
    },
    "/api/v1/compare": {
      get: {
        operationId: "compareRoyalExchangeIssuers",
        summary: "Compare two to six exact issuer tickers",
        description: "Use only when the user asks to compare multiple issuers. Pass exact comma-separated tickers.",
        parameters: [{ name: "identifiers", in: "query", required: true, description: "Two to six exact comma-separated tickers, for example WIRE,IRON.", schema: { type: "string" } }],
        responses: { "200": successResponse("Issuer comparison.", { comparison: { type: "array", minItems: 2, maxItems: 6, items: { $ref: "#/components/schemas/Company" } } }, ["comparison"]), "400": errorResponse, "404": errorResponse, "409": errorResponse },
      },
    },
    "/api/v1/notices": {
      get: {
        operationId: "getRoyalExchangeNotices",
        summary: "Get current simulated market notices and affected movers",
        description: "Use for anomaly, event, disruption, rumor, or market-notice questions.",
        parameters: [{ name: "moverLimit", in: "query", schema: { type: "integer", minimum: 1, maximum: 10, default: 5 } }],
        responses: { "200": successResponse("Current market notices.", { notices: { type: "array", items: { type: "object", additionalProperties: true } }, largestMoves: { type: "array", items: { $ref: "#/components/schemas/Company" } } }, ["notices", "largestMoves"]), "400": errorResponse },
      },
    },
    "/api/v1/wares": {
      get: {
        operationId: "findRoyalExchangeMinecraftWares",
        summary: "Map vanilla Minecraft wares to Royal Exchange issuers",
        description: "Use when the user asks which issuer covers a Minecraft item or registry-id fragment.",
        parameters: [
          { name: "query", in: "query", required: true, schema: { type: "string", minLength: 1, maxLength: 80 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 20, default: 10 } },
        ],
        responses: { "200": successResponse("Matching Minecraft wares and issuers.", { query: { type: "string" }, matchCount: { type: "integer" }, matches: { type: "array", items: { type: "object", additionalProperties: true } } }, ["query", "matchCount", "matches"]), "400": errorResponse },
      },
    },
  },
  components: {
    schemas: {
      ResponseMeta: metaSchema,
      Company: companySchema,
      ErrorResponse: {
        type: "object",
        required: ["meta", "error"],
        properties: {
          meta: { type: "object", required: ["apiVersion", "requestId", "source", "simulated"], properties: metaSchema.properties },
          error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" }, suggestion: { type: "string" }, candidates: { type: "array", items: { type: "object" } } } },
        },
      },
    },
  },
} as const;

export function handleOpenApi(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" } });
  if (request.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "GET, OPTIONS" } });
  return Response.json(ROYAL_EXCHANGE_OPENAPI, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "X-Royal-Exchange-Simulation": "true",
    },
  });
}
