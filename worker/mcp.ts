import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { MINECRAFT_ITEM_COUNT, MINECRAFT_VERSION } from "../app/minecraft-items";
import {
  compareIssuers,
  errorPayload,
  findMinecraftWares,
  getIssuer,
  getNotices,
  getOverview,
  searchMarket,
  type HistoryPeriod,
  type MarketDataEnv,
} from "./market-query";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const MCP_HOSTS = [
  "royalexchange.net",
  "www.royalexchange.net",
  "royal-exchange-online.royal-exchange-market.workers.dev",
  "localhost",
  "127.0.0.1",
];

const MCP_ORIGINS = [
  ...MCP_HOSTS,
  "chatgpt.com",
  "chat.openai.com",
];

function jsonResult(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

async function queryResult(work: Promise<Record<string, unknown>>) {
  try {
    return jsonResult(await work);
  } catch (error) {
    const result = errorPayload(error, crypto.randomUUID());
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify(result.body, null, 2) }],
      structuredContent: result.body,
    };
  }
}

function createRoyalExchangeServer(env: MarketDataEnv) {
  const server = new McpServer({
    name: "Royal Exchange",
    version: "1.1.0",
  });

  server.registerTool("get_market_overview", {
    title: "Get Royal Exchange overview",
    description: "Read the current simulated Royal Exchange composite, market breadth, volume, active notices, and largest stock movements.",
    inputSchema: z.object({}),
    annotations: READ_ONLY,
  }, async () => {
    return queryResult(getOverview(env));
  });

  server.registerTool("search_market", {
    title: "Search Royal Exchange stocks",
    description: "Find listed fictional guild companies by ticker, company name, sector, or Minecraft wares and trade terms.",
    inputSchema: z.object({
      query: z.string().trim().min(1).max(80).describe("Ticker, company, sector, ware, or trade term to find."),
      limit: z.number().int().min(1).max(20).default(10).describe("Maximum matching issuers to return."),
    }),
    annotations: READ_ONLY,
  }, async ({ query, limit }) => {
    return queryResult(searchMarket(env, query, limit));
  });

  server.registerTool("get_issuer", {
    title: "Get a Royal Exchange issuer",
    description: "Read one stock's current quote, recorded price history, principal Minecraft wares, and fictional historical charter lore.",
    inputSchema: z.object({
      identifier: z.string().trim().min(1).max(100).describe("Ticker or part of the issuer name, sector, or principal trade."),
      period: z.enum(["1h", "6h", "24h", "7d"]).default("24h").describe("Historical performance window to summarize."),
      historyPoints: z.number().int().min(1).max(120).default(48).describe("Most recent recorded price points to return."),
    }),
    annotations: READ_ONLY,
  }, async ({ identifier, period, historyPoints }) => {
    return queryResult(getIssuer(env, identifier, period as HistoryPeriod, historyPoints));
  });

  server.registerTool("compare_issuers", {
    title: "Compare Royal Exchange issuers",
    description: "Compare two to six Royal Exchange stocks using current price, session movement, range, volume, trade, and fictional market standing.",
    inputSchema: z.object({
      identifiers: z.array(z.string().trim().min(1).max(100)).min(2).max(6).describe("Tickers or company names to compare."),
    }),
    annotations: READ_ONLY,
  }, async ({ identifiers }) => {
    return queryResult(compareIssuers(env, identifiers));
  });

  server.registerTool("get_market_notices", {
    title: "Get Royal Exchange notices",
    description: "Read current simulated market anomalies and the stocks they affect, plus the largest present movements for context.",
    inputSchema: z.object({
      moverLimit: z.number().int().min(1).max(10).default(5).describe("Number of largest stock movements to include."),
    }),
    annotations: READ_ONLY,
  }, async ({ moverLimit }) => {
    return queryResult(getNotices(env, moverLimit));
  });

  server.registerTool("find_minecraft_wares", {
    title: "Find Minecraft wares and their stocks",
    description: `Search the ${MINECRAFT_ITEM_COUNT} individual vanilla Minecraft ${MINECRAFT_VERSION} wares and identify each responsible Royal Exchange issuer and live quote.`,
    inputSchema: z.object({
      query: z.string().trim().min(1).max(80).describe("Minecraft item name or registry-id fragment, such as redstone, wool, diamond, or music_disc."),
      limit: z.number().int().min(1).max(20).default(10).describe("Maximum matching wares to return."),
    }),
    annotations: READ_ONLY,
  }, async ({ query, limit }) => {
    return queryResult(findMinecraftWares(env, query, limit));
  });

  return server;
}

export function handleRoyalExchangeMcp(
  request: Request,
  env: MarketDataEnv,
  ctx: ExecutionContext,
) {
  return createMcpHandler(() => createRoyalExchangeServer(env), {
    route: "/mcp",
    allowedHostnames: MCP_HOSTS,
    allowedOriginHostnames: MCP_ORIGINS,
    corsOptions: {
      origin: "*",
      methods: "GET, POST, DELETE, OPTIONS",
      headers: "Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
      exposeHeaders: "Mcp-Session-Id",
      maxAge: 86400,
    },
    onerror(error) {
      console.error(JSON.stringify({ message: "Royal Exchange MCP request failed", error: error.message }));
    },
  })(request, env, ctx);
}
