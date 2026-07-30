import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { charterRecord, standingFor } from "../app/market-records";
import { MINECRAFT_ITEMS, MINECRAFT_ITEM_COUNT, MINECRAFT_VERSION } from "../app/minecraft-items";
import { getMarketSnapshot, type ListedCompany, type MarketSnapshot } from "../lib/market";
import { getRecordedMarketSnapshot } from "../lib/market-ledger";

type MarketDataEnv = {
  DB?: D1Database;
};

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

async function marketSnapshot(env: MarketDataEnv): Promise<MarketSnapshot> {
  if (!env.DB) return getMarketSnapshot();
  try {
    return await getRecordedMarketSnapshot(env.DB, new Date());
  } catch (error) {
    console.error(JSON.stringify({
      message: "Royal Exchange MCP ledger unavailable",
      error: error instanceof Error ? error.message : String(error),
    }));
    return getMarketSnapshot();
  }
}

function jsonResult(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

function compactCompany(company: ListedCompany) {
  return {
    ticker: company.ticker,
    name: company.name,
    sector: company.sector,
    principalTrade: company.influence,
    priceCrowns: company.price,
    changeCrowns: company.change,
    changePercent: company.changePercent,
    volume: company.volume,
  };
}

function companySearchText(company: ListedCompany) {
  return `${company.ticker} ${company.name} ${company.sector} ${company.influence}`.toLowerCase();
}

function findCompany(companies: ListedCompany[], identifier: string) {
  const needle = identifier.trim().toLowerCase();
  return companies.find((company) => company.ticker.toLowerCase() === needle || company.name.toLowerCase() === needle)
    ?? companies.find((company) => companySearchText(company).includes(needle));
}

function createRoyalExchangeServer(env: MarketDataEnv) {
  const server = new McpServer({
    name: "Royal Exchange",
    version: "1.0.0",
  });

  server.registerTool("get_market_overview", {
    title: "Get Royal Exchange overview",
    description: "Read the current simulated Royal Exchange composite, market breadth, volume, active notices, and largest stock movements.",
    inputSchema: z.object({}),
    annotations: READ_ONLY,
  }, async () => {
    const snapshot = await marketSnapshot(env);
    const largestMoves = [...snapshot.companies]
      .sort((left, right) => Math.abs(right.changePercent) - Math.abs(left.changePercent))
      .slice(0, 5)
      .map(compactCompany);
    return jsonResult({
      exchange: snapshot.exchange,
      simulated: snapshot.simulation,
      status: snapshot.status,
      asOf: snapshot.asOf,
      currency: snapshot.currency,
      composite: snapshot.composite,
      compositeChange: snapshot.compositeChange,
      compositeChangePercent: snapshot.compositeChangePercent,
      totalVolume: snapshot.totalVolume,
      breadth: {
        advancing: snapshot.advancing,
        declining: snapshot.declining,
        unchanged: snapshot.unchanged,
      },
      listedIssuers: snapshot.companies.length,
      history: {
        mode: snapshot.historyMode,
        recordedFrom: snapshot.recordedFrom,
        observations: snapshot.recordedObservations,
      },
      currentNotice: snapshot.event,
      largestMoves,
      source: "https://royalexchange.net/",
    });
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
    const snapshot = await marketSnapshot(env);
    const needle = query.toLowerCase();
    const matches = snapshot.companies.filter((company) => companySearchText(company).includes(needle)).slice(0, limit);
    return jsonResult({
      query,
      asOf: snapshot.asOf,
      matchCount: matches.length,
      matches: matches.map(compactCompany),
    });
  });

  server.registerTool("get_issuer", {
    title: "Get a Royal Exchange issuer",
    description: "Read one stock's current quote, recorded price history, principal Minecraft wares, and fictional historical charter lore.",
    inputSchema: z.object({
      identifier: z.string().trim().min(1).max(100).describe("Ticker or part of the issuer name, sector, or principal trade."),
      historyPoints: z.number().int().min(1).max(120).default(48).describe("Most recent recorded price points to return."),
    }),
    annotations: READ_ONLY,
  }, async ({ identifier, historyPoints }) => {
    const snapshot = await marketSnapshot(env);
    const company = findCompany(snapshot.companies, identifier);
    if (!company) return errorResult(`No Royal Exchange issuer matches "${identifier}".`);
    const lore = charterRecord(company);
    return jsonResult({
      asOf: snapshot.asOf,
      simulated: true,
      issuer: {
        ...compactCompany(company),
        sessionOpen: company.open,
        previousClose: company.previousClose,
        high: company.high,
        low: company.low,
        standing: standingFor(company),
        charter: lore,
        history: company.history.slice(-historyPoints),
      },
      activeNotices: snapshot.events.filter((event) => event.affectedTickers.includes(company.ticker)),
    });
  });

  server.registerTool("compare_issuers", {
    title: "Compare Royal Exchange issuers",
    description: "Compare two to six Royal Exchange stocks using current price, session movement, range, volume, trade, and fictional market standing.",
    inputSchema: z.object({
      identifiers: z.array(z.string().trim().min(1).max(100)).min(2).max(6).describe("Tickers or company names to compare."),
    }),
    annotations: READ_ONLY,
  }, async ({ identifiers }) => {
    const snapshot = await marketSnapshot(env);
    const companies = identifiers.map((identifier) => findCompany(snapshot.companies, identifier));
    const missing = identifiers.filter((_identifier, index) => !companies[index]);
    if (missing.length > 0) return errorResult(`No issuer matched: ${missing.join(", ")}.`);
    return jsonResult({
      asOf: snapshot.asOf,
      simulated: true,
      comparison: companies.filter((company): company is ListedCompany => Boolean(company)).map((company) => ({
        ...compactCompany(company),
        sessionOpen: company.open,
        previousClose: company.previousClose,
        high: company.high,
        low: company.low,
        standing: standingFor(company),
      })),
    });
  });

  server.registerTool("get_market_notices", {
    title: "Get Royal Exchange notices",
    description: "Read current simulated market anomalies and the stocks they affect, plus the largest present movements for context.",
    inputSchema: z.object({
      moverLimit: z.number().int().min(1).max(10).default(5).describe("Number of largest stock movements to include."),
    }),
    annotations: READ_ONLY,
  }, async ({ moverLimit }) => {
    const snapshot = await marketSnapshot(env);
    return jsonResult({
      asOf: snapshot.asOf,
      simulated: true,
      notices: snapshot.events.length > 0 ? snapshot.events : [snapshot.event],
      largestMoves: [...snapshot.companies]
        .sort((left, right) => Math.abs(right.changePercent) - Math.abs(left.changePercent))
        .slice(0, moverLimit)
        .map(compactCompany),
    });
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
    const snapshot = await marketSnapshot(env);
    const companies = new Map(snapshot.companies.map((company) => [company.ticker, company]));
    const needle = query.toLowerCase();
    const matches = MINECRAFT_ITEMS
      .filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(needle))
      .slice(0, limit)
      .map((item) => {
        const company = companies.get(item.ticker);
        return {
          name: item.name,
          registryId: `minecraft:${item.id}`,
          issuer: company ? compactCompany(company) : { ticker: item.ticker },
        };
      });
    return jsonResult({
      query,
      minecraftVersion: MINECRAFT_VERSION,
      totalCatalogSize: MINECRAFT_ITEM_COUNT,
      matchCount: matches.length,
      matches,
      asOf: snapshot.asOf,
    });
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
