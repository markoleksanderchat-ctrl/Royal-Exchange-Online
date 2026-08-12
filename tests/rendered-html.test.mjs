import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function worker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const environment = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};

const context = {
  waitUntil() {},
  passThroughOnException() {},
};

test("server-renders the finished Royal Exchange", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("https://exchange.example/", { headers: { accept: "text/html" } }), environment, context);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Royal Exchange — Crown Market Data<\/title>/i);
  assert.match(html, /Royal Exchange/);
  assert.match(html, /Official website of the simulated Royal Exchange/);
  assert.match(html, /The Crown Market at Guildhall/);
  assert.match(html, /Royal Exchange Composite/);
  assert.match(html, /Market overview/);
  assert.match(html, /Official list/);
  assert.match(html, /Market data API/);
  assert.match(html, /Simulated market notice/);
  assert.match(html, /Five-minute clearing/);
  assert.match(html, /Dark mode/);
  assert.match(html, /Daily Official List/);
  assert.match(html, /Merchant(?:’|&rsquo;)s Price Book/);
  assert.match(html, /Individual Minecraft wares/);
  assert.match(html, /1,332[\s\S]{0,120}individual vanilla[\s\S]{0,120}1\.21\.1[\s\S]{0,120}items/);
  assert.match(html, /Redstone Dust/);
  assert.match(html, /minecraft:[\s\S]{0,40}redstone/);
  assert.match(html, /Personal Merchant(?:’|&rsquo;)s Ledger/);
  assert.match(html, /Read company charter/);
  assert.match(html, /Recorded history range/);
  assert.match(html, />1D</);
  assert.match(html, />7D</);
  assert.match(html, />30D</);
  assert.match(html, />ALL</);
  assert.match(html, /Ledger began/);
  assert.match(html, /Pinned only on this device/);
  assert.match(html, /Browne of Calais Staple/);
  assert.match(html, /Whittington Mercery/);
  assert.match(html, /Walworth &amp; Lovekyn Fish House/);
  assert.match(html, /\/api\/market/);
  assert.match(html, /ChatGPT OpenAPI schema/);
  assert.match(html, /\/openapi\.json/);
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape|signin-with-chatgpt/i);
});

test("publishes a complete autonomous market snapshot", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("https://exchange.example/api/market"), environment, context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("x-royal-exchange-mode"), "autonomous-wall-clock");
  assert.equal(response.headers.get("x-royal-exchange-simulation"), "true");
  assert.equal(response.headers.get("x-royal-exchange-history"), "unavailable");
  const market = await response.json();
  assert.equal(market.exchange, "Royal Exchange");
  assert.equal(market.status, "OPEN");
  assert.equal(market.mode, "autonomous-wall-clock");
  assert.equal(market.simulation, true);
  assert.equal(market.modelVersion, "royal-exchange-clearing-v3");
  assert.equal(market.modelStartedAt, null);
  assert.ok(Array.isArray(market.events));
  assert.equal(typeof market.event.id, "string");
  assert.equal(typeof market.event.severity, "string");
  assert.equal(market.historyMode, "unavailable");
  assert.equal(market.recordedObservations, 0);
  assert.equal(market.companies.length, 38);
  assert.ok(market.composite > 0);
  assert.ok(market.totalVolume > 0);
  assert.ok(Date.parse(market.nextUpdateAt) > Date.parse(market.asOf));
  for (const company of market.companies) {
    assert.match(company.ticker, /^[A-Z]{3,4}$/);
    assert.ok(company.price > 0);
    assert.ok(company.open > 0);
    assert.ok(company.previousClose > 0);
    assert.ok(company.bid < company.ask);
    assert.ok(company.spread > 0);
    assert.ok(company.trades >= 0);
    assert.equal(company.history.length, 1);
  }
  assert.ok(market.companies.some((company) => company.influence.includes("Redstone")));
  assert.ok(market.companies.some((company) => company.influence.includes("Nether")));
  assert.ok(market.companies.some((company) => company.influence.toLowerCase().includes("music discs")));
  assert.equal(new Set(market.companies.map((company) => company.ticker)).size, 38);
});

test("publishes a compact read-only assistant API", async () => {
  const app = await worker();
  const overviewResponse = await app.fetch(new Request("https://exchange.example/api/assistant"), environment, context);
  assert.equal(overviewResponse.status, 200);
  assert.equal(overviewResponse.headers.get("access-control-allow-origin"), "*");
  const overview = await overviewResponse.json();
  assert.equal(overview.mode, "overview");
  assert.equal(overview.simulated, true);
  assert.equal(overview.listedIssuers, 38);
  assert.equal(overview.matches.length, 0);
  assert.equal(overview.meta.apiVersion, "1.0");
  assert.equal(overview.meta.modelVersion, "royal-exchange-clearing-v3");
  assert.equal(overview.meta.degraded, true);
  assert.ok(JSON.stringify(overview).length < 5_000);

  const issuerResponse = await app.fetch(new Request("https://exchange.example/api/assistant?identifier=WIRE&historyPoints=4"), environment, context);
  assert.equal(issuerResponse.status, 200);
  const issuer = await issuerResponse.json();
  assert.equal(issuer.mode, "issuer");
  assert.equal(issuer.issuer.ticker, "WIRE");
  assert.equal(issuer.issuer.charter.register, "RXC-WIRE");
  assert.ok(issuer.issuer.history.length <= 4);

  const searchResponse = await app.fetch(new Request("https://exchange.example/api/assistant?query=redstone"), environment, context);
  assert.equal(searchResponse.status, 200);
  const search = await searchResponse.json();
  assert.equal(search.mode, "search");
  assert.ok(search.matches.some((company) => company.ticker === "WIRE"));
  assert.equal(search.matches[0].history, undefined);
  assert.ok(JSON.stringify(search).length < 5_000);
});

test("publishes explicit compact ChatGPT operations and OpenAPI", async () => {
  const app = await worker();
  const overviewResponse = await app.fetch(new Request("https://exchange.example/api/v1/overview"), environment, context);
  assert.equal(overviewResponse.status, 200);
  assert.equal(overviewResponse.headers.get("x-royal-exchange-api-version"), "1.0");
  assert.match(overviewResponse.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/i);
  const overview = await overviewResponse.json();
  assert.equal(overview.largestMoves.length, 5);
  assert.equal(overview.meta.dataMode, "fallback-simulation");
  assert.equal(overview.meta.degraded, true);
  assert.ok(JSON.stringify(overview).length < 5_000);

  const v1SearchResponse = await app.fetch(new Request("https://exchange.example/api/v1/search?query=redstone"), environment, context);
  assert.equal(v1SearchResponse.status, 200);
  const v1Search = await v1SearchResponse.json();
  assert.equal(v1Search.matches[0].history, undefined);
  assert.ok(JSON.stringify(v1Search).length < 5_000);

  const issuerResponse = await app.fetch(new Request("https://exchange.example/api/v1/issuers/WIRE?period=6h&historyPoints=12"), environment, context);
  assert.equal(issuerResponse.status, 200);
  const issuer = await issuerResponse.json();
  assert.equal(issuer.issuer.ticker, "WIRE");
  assert.equal(issuer.issuer.performance.period, "6h");
  assert.equal(issuer.issuer.performance.completePeriod, false);
  assert.ok(issuer.issuer.history.length <= 12);

  const allHistoryResponse = await app.fetch(new Request("https://exchange.example/api/v1/issuers/WIRE?period=all&historyPoints=120"), environment, context);
  assert.equal(allHistoryResponse.status, 200);
  const allHistory = await allHistoryResponse.json();
  assert.equal(allHistory.issuer.performance.period, "all");

  const ambiguousResponse = await app.fetch(new Request("https://exchange.example/api/v1/issuers/Food"), environment, context);
  assert.equal(ambiguousResponse.status, 409);
  const ambiguous = await ambiguousResponse.json();
  assert.equal(ambiguous.error.code, "ambiguous_issuer");
  assert.ok(ambiguous.error.candidates.length > 1);

  const openApiResponse = await app.fetch(new Request("https://exchange.example/openapi.json"), environment, context);
  assert.equal(openApiResponse.status, 200);
  const openApi = await openApiResponse.json();
  assert.equal(openApi.openapi, "3.1.0");
  assert.deepEqual(Object.values(openApi.paths).map((path) => path.get.operationId), [
    "getRoyalExchangeOverview",
    "searchRoyalExchange",
    "getRoyalExchangeIssuer",
    "compareRoyalExchangeIssuers",
    "getRoyalExchangeNotices",
    "findRoyalExchangeMinecraftWares",
  ]);
  assert.ok(Object.values(openApi.paths).every((path) => path.get && !path.post && !path.put && !path.patch && !path.delete));
});

test("removes starter assets and packages production metadata", async () => {
  const [packageJson, hosting, layout, styles, dashboard, records, minecraftItems, generator, mcp, assistantApi, workerEntry, socialCard] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/MarketDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/market-records.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/minecraft-items.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/generate-minecraft-item-catalog.ps1", import.meta.url), "utf8"),
    readFile(new URL("../worker/mcp.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/assistant-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    access(new URL("../public/og.png", import.meta.url)),
  ]);
  assert.doesNotMatch(packageJson, /react-loading-skeleton|site-creator-vinext-starter/);
  assert.match(packageJson, /@modelcontextprotocol\/server/);
  assert.match(packageJson, /"agents"/);
  assert.doesNotMatch(layout, /codex-preview|Starter Project|favicon\.svg/);
  assert.match(styles, /\.primary-nav/);
  assert.match(styles, /\.market-strip \{ min-width: 0; grid-column: 1 \/ -1; display: grid;/);
  assert.match(styles, /\.market-row \{[\s\S]*?grid-template-columns:/);
  assert.match(styles, /@media \(max-width: 780px\)[\s\S]*?\.primary-nav \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)[\s\S]*?\.index-line \{ display: grid;/);
  assert.match(styles, /@media \(max-width: 1050px\)[\s\S]*?\.market-rail \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 500px\)[\s\S]*?\.focus-heading \{ display: grid;/);
  assert.match(styles, /:root\[data-theme="dark"\]/);
  assert.match(styles, /\.chart-tooltip/);
  assert.match(styles, /\.chart-crosshair/);
  assert.doesNotMatch(styles, /backdrop-filter|linear-gradient|glassmorphism/i);
  assert.match(dashboard, /royal-exchange-merchant-ledger-v1/);
  assert.match(dashboard, /royal-exchange-theme-v1/);
  assert.match(dashboard, /onPointerMove/);
  assert.match(dashboard, /ArrowLeft/);
  assert.match(dashboard, /Crowns at/);
  assert.match(dashboard, /"24h" \| "7d" \| "30d" \| "all"/);
  assert.match(dashboard, /Fictional market charter/);
  assert.match(dashboard, /Nothing here is sent to Minecraft or the public exchange/);
  assert.match(records, /CHARTER_SEATS/);
  assert.match(minecraftItems, /MINECRAFT_ITEM_COUNT = 1332/);
  assert.match(minecraftItems, /id: "diamond", name: "Diamond", ticker: "GDSM"/);
  assert.match(minecraftItems, /id: "music_disc_13", name: "Music Disc", ticker: "MUSC"/);
  assert.match(generator, /assets\/minecraft\/models\/item/);
  assert.match(mcp, /createMcpHandler/);
  assert.match(mcp, /readOnlyHint: true/);
  assert.match(mcp, /find_minecraft_wares/);
  assert.match(assistantApi, /handleAssistantApi/);
  assert.match(assistantApi, /getLegacyAssistantResponse/);
  assert.match(workerEntry, /url\.pathname === "\/mcp"/);
  assert.match(workerEntry, /url\.pathname === "\/api\/assistant"/);
  assert.match(workerEntry, /url\.pathname\.startsWith\("\/api\/v1\/"\)/);
  assert.match(workerEntry, /url\.pathname === "\/openapi\.json"/);
  assert.deepEqual(JSON.parse(hosting), { project_id: "appgprj_6a73a22600c48191a52ac3a7fb165b80", d1: "DB", r2: null });
  assert.equal(socialCard, undefined);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});
