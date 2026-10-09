import { charterRecord, standingFor } from "../app/market-records";
import { MINECRAFT_ITEMS, MINECRAFT_ITEM_COUNT, MINECRAFT_VERSION } from "../app/minecraft-items";
import { getMarketSnapshot, type ListedCompany, type MarketHistoryPoint, type MarketSnapshot } from "../lib/market";
import { getRecordedIssuerHistory, getRecordedMarketSnapshot } from "../lib/market-ledger";

export type MarketDataEnv = { DB?: D1Database };
export type HistoryPeriod = "1h" | "6h" | "24h" | "7d" | "30d" | "all";

export class MarketQueryError extends Error {
  constructor(
    public readonly code: "invalid_request" | "issuer_not_found" | "ambiguous_issuer",
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type LoadedMarket = {
  snapshot: MarketSnapshot;
  dataMode: "recorded-ledger" | "fallback-simulation";
  degraded: boolean;
};

const PERIOD_MINUTES: Record<HistoryPeriod, number | null> = {
  "1h": 60,
  "6h": 360,
  "24h": 1_440,
  "7d": 10_080,
  "30d": 43_200,
  "all": null,
};

export async function loadMarket(env: MarketDataEnv): Promise<LoadedMarket> {
  if (!env.DB) return { snapshot: getMarketSnapshot(), dataMode: "fallback-simulation", degraded: true };
  try {
    return { snapshot: await getRecordedMarketSnapshot(env.DB, new Date()), dataMode: "recorded-ledger", degraded: false };
  } catch (error) {
    console.error(JSON.stringify({
      message: "Royal Exchange recorded ledger unavailable",
      error: error instanceof Error ? error.message : String(error),
    }));
    return { snapshot: getMarketSnapshot(), dataMode: "fallback-simulation", degraded: true };
  }
}

function meta(loaded: LoadedMarket, requestId = crypto.randomUUID()) {
  const asOfMillis = Date.parse(loaded.snapshot.asOf);
  return {
    apiVersion: "1.0",
    requestId,
    asOf: loaded.snapshot.asOf,
    dataAgeSeconds: Number.isFinite(asOfMillis) ? Math.max(0, Math.round((Date.now() - asOfMillis) / 1_000)) : null,
    dataMode: loaded.dataMode,
    degraded: loaded.degraded,
    modelVersion: loaded.snapshot.modelVersion,
    modelStartedAt: loaded.snapshot.modelStartedAt,
    recordedFrom: loaded.snapshot.recordedFrom,
    recordedObservations: loaded.snapshot.recordedObservations,
    source: "https://royalexchange.net/",
    simulated: true,
  };
}

export function compactCompany(company: ListedCompany) {
  return {
    ticker: company.ticker,
    name: company.name,
    sector: company.sector,
    principalTrade: company.influence,
    priceCrowns: company.price,
    bidCrowns: company.bid,
    askCrowns: company.ask,
    spreadCrowns: company.spread,
    changeCrowns: company.change,
    changePercent: company.changePercent,
    volume: company.volume,
    matchedTrades: company.trades,
  };
}

function companySearchText(company: ListedCompany) {
  return `${company.ticker} ${company.name} ${company.sector} ${company.influence}`.toLowerCase();
}

function resolveCompany(companies: ListedCompany[], identifier: string) {
  const needle = identifier.trim().toLowerCase();
  const exact = companies.find((company) => company.ticker.toLowerCase() === needle || company.name.toLowerCase() === needle);
  if (exact) return exact;
  const matches = companies.filter((company) => companySearchText(company).includes(needle));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new MarketQueryError("issuer_not_found", `No Royal Exchange issuer matches "${identifier}".`, 404, {
      suggestion: "Search the market first, then use an exact ticker.",
    });
  }
  throw new MarketQueryError("ambiguous_issuer", `More than one Royal Exchange issuer matches "${identifier}".`, 409, {
    candidates: matches.slice(0, 8).map((company) => ({ ticker: company.ticker, name: company.name })),
    suggestion: "Retry with one exact ticker.",
  });
}

function performance(points: MarketHistoryPoint[], period: HistoryPeriod) {
  const first = points[0];
  const last = points.at(-1);
  const values = points.map((point) => point.value);
  const observedMilliseconds = first && last ? Math.max(0, Date.parse(last.time) - Date.parse(first.time)) : 0;
  const periodMinutes = PERIOD_MINUTES[period];
  const requestedMilliseconds = periodMinutes === null ? observedMilliseconds : periodMinutes * 60_000;
  const changeCrowns = first && last ? Number((last.value - first.value).toFixed(2)) : null;
  const changePercent = first && last && first.value !== 0
    ? Number((((last.value - first.value) / first.value) * 100).toFixed(2))
    : null;
  return {
    period,
    observationCount: points.length,
    availableFrom: first?.time ?? null,
    availableTo: last?.time ?? null,
    startPriceCrowns: first?.value ?? null,
    endPriceCrowns: last?.value ?? null,
    changeCrowns,
    changePercent,
    highCrowns: values.length > 0 ? Math.max(...values) : null,
    lowCrowns: values.length > 0 ? Math.min(...values) : null,
    coveragePercent: requestedMilliseconds > 0
      ? Number(Math.min(100, (observedMilliseconds / requestedMilliseconds) * 100).toFixed(1))
      : 0,
    completePeriod: period === "all" ? points.length >= 2 : observedMilliseconds >= requestedMilliseconds * 0.9,
    sufficientData: points.length >= 2,
  };
}

async function historyFor(
  env: MarketDataEnv,
  loaded: LoadedMarket,
  company: ListedCompany,
  period: HistoryPeriod,
  historyPoints: number,
) {
  const minutes = PERIOD_MINUTES[period];
  if (loaded.dataMode === "recorded-ledger" && minutes !== null && minutes <= 1_440) {
    const cutoff = Date.parse(loaded.snapshot.asOf) - minutes * 60_000;
    const points = company.history.filter((point) => Date.parse(point.time) >= cutoff);
    if (points.length <= historyPoints) return points;
    if (historyPoints === 1) return points.slice(-1);
    return Array.from({ length: historyPoints }, (_, index) => points[Math.round(index * (points.length - 1) / (historyPoints - 1))]);
  }
  if (env.DB && loaded.dataMode === "recorded-ledger") {
    try {
      const points = await getRecordedIssuerHistory(env.DB, company.ticker, PERIOD_MINUTES[period], historyPoints);
      if (points.length > 0) return points;
    } catch (error) {
      console.error(JSON.stringify({
        message: "Royal Exchange issuer history unavailable",
        ticker: company.ticker,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }
  return company.history.slice(-historyPoints);
}

export async function getOverview(env: MarketDataEnv, moverLimit = 5, requestId?: string) {
  const loaded = await loadMarket(env);
  const snapshot = loaded.snapshot;
  return {
    meta: meta(loaded, requestId),
    exchange: snapshot.exchange,
    status: snapshot.status,
    session: snapshot.session,
    currency: snapshot.currency,
    composite: snapshot.composite,
    compositeChange: snapshot.compositeChange,
    compositeChangePercent: snapshot.compositeChangePercent,
    totalVolume: snapshot.totalVolume,
    breadth: { advancing: snapshot.advancing, declining: snapshot.declining, unchanged: snapshot.unchanged },
    listedIssuers: snapshot.companies.length,
    currentNotices: snapshot.events,
    largestMoves: [...snapshot.companies]
      .sort((left, right) => Math.abs(right.changePercent) - Math.abs(left.changePercent))
      .slice(0, moverLimit)
      .map(compactCompany),
  };
}

export async function searchMarket(env: MarketDataEnv, query: string, limit = 10, requestId?: string) {
  const loaded = await loadMarket(env);
  const needle = query.trim().toLowerCase();
  const matches = loaded.snapshot.companies.filter((company) => companySearchText(company).includes(needle)).slice(0, limit);
  return {
    meta: meta(loaded, requestId),
    query,
    matchCount: matches.length,
    matches: matches.map(compactCompany),
  };
}

export async function getIssuer(
  env: MarketDataEnv,
  identifier: string,
  period: HistoryPeriod = "24h",
  historyPoints = 48,
  requestId?: string,
) {
  const loaded = await loadMarket(env);
  const company = resolveCompany(loaded.snapshot.companies, identifier);
  const history = await historyFor(env, loaded, company, period, historyPoints);
  return {
    meta: meta(loaded, requestId),
    issuer: {
      ...compactCompany(company),
      sessionOpen: company.open,
      previousClose: company.previousClose,
      sessionHigh: company.high,
      sessionLow: company.low,
      standing: standingFor(company),
      charter: charterRecord(company),
      performance: performance(history, period),
      history,
    },
    activeNotices: loaded.snapshot.events.filter((event) => event.affectedTickers.includes(company.ticker)),
  };
}

export async function compareIssuers(env: MarketDataEnv, identifiers: string[], requestId?: string) {
  const loaded = await loadMarket(env);
  const companies = identifiers.map((identifier) => resolveCompany(loaded.snapshot.companies, identifier));
  return {
    meta: meta(loaded, requestId),
    comparison: companies.map((company) => ({
      ...compactCompany(company),
      sessionOpen: company.open,
      previousClose: company.previousClose,
      sessionHigh: company.high,
      sessionLow: company.low,
      standing: standingFor(company),
    })),
  };
}

export async function getNotices(env: MarketDataEnv, moverLimit = 5, requestId?: string) {
  const loaded = await loadMarket(env);
  return {
    meta: meta(loaded, requestId),
    notices: loaded.snapshot.events.length > 0 ? loaded.snapshot.events : [loaded.snapshot.event],
    largestMoves: [...loaded.snapshot.companies]
      .sort((left, right) => Math.abs(right.changePercent) - Math.abs(left.changePercent))
      .slice(0, moverLimit)
      .map(compactCompany),
  };
}

export async function findMinecraftWares(env: MarketDataEnv, query: string, limit = 10, requestId?: string) {
  const loaded = await loadMarket(env);
  const companies = new Map(loaded.snapshot.companies.map((company) => [company.ticker, company]));
  const needle = query.trim().toLowerCase();
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
  return {
    meta: meta(loaded, requestId),
    query,
    minecraftVersion: MINECRAFT_VERSION,
    totalCatalogSize: MINECRAFT_ITEM_COUNT,
    matchCount: matches.length,
    matches,
  };
}

export async function getLegacyAssistantResponse(
  env: MarketDataEnv,
  options: { identifier?: string; query?: string; historyPoints: number; matchLimit: number },
  requestId = crypto.randomUUID(),
) {
  const loaded = await loadMarket(env);
  const snapshot = loaded.snapshot;
  if (options.identifier) {
    const company = resolveCompany(snapshot.companies, options.identifier);
    const history = await historyFor(env, loaded, company, "24h", options.historyPoints);
    return {
      mode: "issuer",
      exchange: snapshot.exchange,
      simulated: true,
      asOf: snapshot.asOf,
      currency: snapshot.currency,
      meta: meta(loaded, requestId),
      issuer: {
        ...compactCompany(company),
        sessionOpen: company.open,
        previousClose: company.previousClose,
        sessionHigh: company.high,
        sessionLow: company.low,
        standing: standingFor(company),
        charter: charterRecord(company),
        performance: performance(history, "24h"),
        history,
      },
      activeNotices: snapshot.events.filter((event) => event.affectedTickers.includes(company.ticker)),
    };
  }

  const query = options.query?.trim().toLowerCase();
  const matches = query
    ? snapshot.companies.filter((company) => companySearchText(company).includes(query)).slice(0, options.matchLimit)
    : [];
  const largestMoves = [...snapshot.companies]
    .sort((left, right) => Math.abs(right.changePercent) - Math.abs(left.changePercent))
    .slice(0, 5)
    .map(compactCompany);
  return {
    mode: query ? "search" : "overview",
    exchange: snapshot.exchange,
    simulated: true,
    status: snapshot.status,
    asOf: snapshot.asOf,
    currency: snapshot.currency,
    meta: meta(loaded, requestId),
    composite: snapshot.composite,
    compositeChange: snapshot.compositeChange,
    compositeChangePercent: snapshot.compositeChangePercent,
    totalVolume: snapshot.totalVolume,
    breadth: { advancing: snapshot.advancing, declining: snapshot.declining, unchanged: snapshot.unchanged },
    listedIssuers: snapshot.companies.length,
    currentNotices: snapshot.events,
    largestMoves,
    query: query ?? null,
    matchCount: matches.length,
    matches: matches.map(compactCompany),
  };
}

export function errorPayload(error: unknown, requestId: string) {
  if (error instanceof MarketQueryError) {
    return {
      status: error.status,
      body: {
        meta: { apiVersion: "1.0", requestId, source: "https://royalexchange.net/", simulated: true },
        error: { code: error.code, message: error.message, ...error.details },
      },
    };
  }
  console.error(JSON.stringify({
    message: "Royal Exchange query failed",
    requestId,
    error: error instanceof Error ? error.message : String(error),
  }));
  return {
    status: 500,
    body: {
      meta: { apiVersion: "1.0", requestId, source: "https://royalexchange.net/", simulated: true },
      error: { code: "internal_error", message: "The Royal Exchange could not complete this read-only query." },
    },
  };
}

export function parsePeriod(value: string | null): HistoryPeriod {
  if (!value) return "24h";
  if (value === "1h" || value === "6h" || value === "24h" || value === "7d" || value === "30d" || value === "all") return value;
  throw new MarketQueryError("invalid_request", "period must be one of 1h, 6h, 24h, 7d, 30d, or all.", 400);
}

export function boundedInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new MarketQueryError("invalid_request", `Expected an integer from ${minimum} to ${maximum}.`, 400);
  }
  return parsed;
}
