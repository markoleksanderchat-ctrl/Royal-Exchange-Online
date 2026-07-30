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
  assert.match(html, /Continuous session/);
  assert.match(html, /Daily Official List/);
  assert.match(html, /Merchant(?:’|&rsquo;)s Price Book/);
  assert.match(html, /Individual Minecraft wares/);
  assert.match(html, /1,332[\s\S]{0,120}individual vanilla[\s\S]{0,120}1\.21\.1[\s\S]{0,120}items/);
  assert.match(html, /Redstone Dust/);
  assert.match(html, /minecraft:[\s\S]{0,40}redstone/);
  assert.match(html, /Personal Merchant(?:’|&rsquo;)s Ledger/);
  assert.match(html, /Read company charter/);
  assert.match(html, /Pinned only on this device/);
  assert.match(html, /Browne of Calais Staple/);
  assert.match(html, /Whittington Mercery/);
  assert.match(html, /Walworth &amp; Lovekyn Fish House/);
  assert.match(html, /\/api\/market/);
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
  assert.equal(market.modelVersion, "royal-exchange-simulation-v1");
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
    assert.equal(company.history.length, 1);
  }
  assert.ok(market.companies.some((company) => company.influence.includes("Redstone")));
  assert.ok(market.companies.some((company) => company.influence.includes("Nether")));
  assert.ok(market.companies.some((company) => company.influence.toLowerCase().includes("music discs")));
  assert.equal(new Set(market.companies.map((company) => company.ticker)).size, 38);
});

test("removes starter assets and packages production metadata", async () => {
  const [packageJson, hosting, layout, styles, dashboard, records, minecraftItems, generator, socialCard] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/MarketDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/market-records.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/minecraft-items.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/generate-minecraft-item-catalog.ps1", import.meta.url), "utf8"),
    access(new URL("../public/og.png", import.meta.url)),
  ]);
  assert.doesNotMatch(packageJson, /react-loading-skeleton|site-creator-vinext-starter/);
  assert.doesNotMatch(layout, /codex-preview|Starter Project|favicon\.svg/);
  assert.match(styles, /\.primary-nav/);
  assert.match(styles, /\.market-strip \{ grid-column: 1 \/ -1; display: grid;/);
  assert.match(styles, /\.market-row \{[\s\S]*?grid-template-columns:/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.index-line \{ display: grid;/);
  assert.match(styles, /@media \(max-width: 1050px\)[\s\S]*?\.market-rail \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 500px\)[\s\S]*?\.focus-heading \{ display: grid;/);
  assert.doesNotMatch(styles, /backdrop-filter|linear-gradient|glassmorphism/i);
  assert.match(dashboard, /royal-exchange-merchant-ledger-v1/);
  assert.match(dashboard, /Fictional market charter/);
  assert.match(dashboard, /Nothing here is sent to Minecraft or the public exchange/);
  assert.match(records, /CHARTER_SEATS/);
  assert.match(minecraftItems, /MINECRAFT_ITEM_COUNT = 1332/);
  assert.match(minecraftItems, /id: "diamond", name: "Diamond", ticker: "GDSM"/);
  assert.match(minecraftItems, /id: "music_disc_13", name: "Music Disc", ticker: "MUSC"/);
  assert.match(generator, /assets\/minecraft\/models\/item/);
  assert.deepEqual(JSON.parse(hosting), { project_id: null, d1: "DB", r2: null });
  assert.equal(socialCard, undefined);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});
