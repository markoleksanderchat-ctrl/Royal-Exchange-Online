import type { MarketHistoryPoint } from "../lib/market.ts";
import { readRxcHistory } from "../lib/rxc-history.ts";

const PERIOD_MINUTES = { "24h": 1440, "7d": 10080, "30d": 43200, all: null } as const;

/** Reads the existing index ledger. Never clears, records, reconstructs or backfills prices. */
export async function readCompositeHistory(db: D1Database, period: keyof typeof PERIOD_MINUTES, now = Date.now()): Promise<MarketHistoryPoint[]> {
  return readRxcHistory(db,PERIOD_MINUTES[period],now);
}

export async function handleCompositeHistory(request: Request, env: { DB?: D1Database }, ctx?: Pick<ExecutionContext,"waitUntil">) {
  const headers = { "Access-Control-Allow-Origin": "*", "X-Royal-Exchange-Simulation": "true" };
  if (request.method !== "GET") return Response.json({ error: "Only GET is supported." }, { status: 405, headers: { ...headers, Allow: "GET" } });
  const period = new URL(request.url).searchParams.get("period") ?? "24h";
  if (!Object.hasOwn(PERIOD_MINUTES, period)) return Response.json({ error: "period must be 24h, 7d, 30d or all." }, { status: 400, headers });
  try {
    const cache = typeof caches !== "undefined" && "default" in caches ? (caches as CacheStorage & {default:Cache}).default : null;
    const latest = env.DB && cache ? await env.DB.prepare("SELECT tick FROM market_ticks ORDER BY tick DESC LIMIT 1").first<{tick:number}>() : null;
    const cacheUrl = new URL(request.url);
    cacheUrl.search = new URLSearchParams({period,version:"rxc-history-2",tick:String(latest?.tick ?? "empty")}).toString();
    const cacheKey = new Request(cacheUrl);
    if (cache && latest) {
      const cached = await cache.match(cacheKey).catch(() => undefined);
      if (cached) {
        const response = new Response(cached.body,cached);
        response.headers.set("Cache-Control","public, max-age=20, stale-while-revalidate=20");
        return response;
      }
    }
    const points = env.DB ? await readCompositeHistory(env.DB, period as keyof typeof PERIOD_MINUTES) : [];
    const response = Response.json({ period, points, simulation: true, historyMode: env.DB ? "recorded-ledger" : "unavailable" }, {
      headers: { ...headers, "Cache-Control": env.DB ? "public, max-age=20, stale-while-revalidate=20" : "no-store" },
    });
    if (cache && latest) {
      const stored = response.clone();
      stored.headers.set("Cache-Control","public, max-age=300");
      const write = cache.put(cacheKey,stored).catch(() => undefined);
      if (ctx) ctx.waitUntil(write); else await write;
    }
    return response;
  } catch {
    return Response.json({ period, points: [], simulation: true, historyMode: "unavailable" }, { status: 503, headers: { ...headers, "Cache-Control": "no-store" } });
  }
}
