import { charterRecord, standingFor } from "../app/market-records";
import { getMarketSnapshot, type ListedCompany, type MarketSnapshot } from "../lib/market";
import { getRecordedMarketSnapshot } from "../lib/market-ledger";

type AssistantApiEnv = {
  DB?: D1Database;
};

const HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=20, stale-while-revalidate=20",
  "X-Royal-Exchange-Simulation": "true",
};

async function marketSnapshot(env: AssistantApiEnv): Promise<MarketSnapshot> {
  if (!env.DB) return getMarketSnapshot();
  try {
    return await getRecordedMarketSnapshot(env.DB, new Date());
  } catch (error) {
    console.error(JSON.stringify({
      message: "Royal Exchange assistant API ledger unavailable",
      error: error instanceof Error ? error.message : String(error),
    }));
    return getMarketSnapshot();
  }
}

function companySearchText(company: ListedCompany) {
  return `${company.ticker} ${company.name} ${company.sector} ${company.influence}`.toLowerCase();
}

function findCompany(companies: ListedCompany[], identifier: string) {
  const needle = identifier.trim().toLowerCase();
  return companies.find((company) => company.ticker.toLowerCase() === needle || company.name.toLowerCase() === needle)
    ?? companies.find((company) => companySearchText(company).includes(needle));
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
    sessionHigh: company.high,
    sessionLow: company.low,
  };
}

function boundedHistoryPoints(value: string | null) {
  const parsed = Number.parseInt(value ?? "6", 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(24, parsed)) : 6;
}

export async function handleAssistantApi(request: Request, env: AssistantApiEnv) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405, headers: HEADERS });

  const url = new URL(request.url);
  const snapshot = await marketSnapshot(env);
  const identifier = url.searchParams.get("identifier")?.trim();
  const query = url.searchParams.get("query")?.trim().toLowerCase();

  if (identifier) {
    const company = findCompany(snapshot.companies, identifier);
    if (!company) return Response.json({ error: `No Royal Exchange issuer matches "${identifier}".` }, { status: 404, headers: HEADERS });
    const historyPoints = boundedHistoryPoints(url.searchParams.get("historyPoints"));
    return Response.json({
      mode: "issuer",
      exchange: snapshot.exchange,
      simulated: true,
      asOf: snapshot.asOf,
      currency: snapshot.currency,
      issuer: {
        ...compactCompany(company),
        sessionOpen: company.open,
        previousClose: company.previousClose,
        standing: standingFor(company),
        charter: charterRecord(company),
        history: company.history.slice(-historyPoints),
      },
      activeNotices: snapshot.events.filter((event) => event.affectedTickers.includes(company.ticker)),
    }, { headers: HEADERS });
  }

  const matches = query
    ? snapshot.companies.filter((company) => companySearchText(company).includes(query)).slice(0, 12)
    : snapshot.companies;
  const largestMoves = [...snapshot.companies]
    .sort((left, right) => Math.abs(right.changePercent) - Math.abs(left.changePercent))
    .slice(0, 5)
    .map(compactCompany);

  return Response.json({
    mode: query ? "search" : "overview",
    exchange: snapshot.exchange,
    simulated: true,
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
    currentNotices: snapshot.events,
    largestMoves,
    query: query ?? null,
    matches: matches.map(compactCompany),
  }, { headers: HEADERS });
}
