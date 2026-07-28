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
  assert.match(html, /<title>Royal Exchange — Live Crown Market<\/title>/i);
  assert.match(html, /Royal Exchange/);
  assert.match(html, /Royal Exchange Composite/);
  assert.match(html, /Market at Guildhall/);
  assert.match(html, /Market notice/);
  assert.match(html, /Daily Official List/);
  assert.match(html, /Company of Merchant Staplers/);
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
  const market = await response.json();
  assert.equal(market.exchange, "Royal Exchange");
  assert.equal(market.status, "OPEN");
  assert.equal(market.mode, "autonomous-wall-clock");
  assert.equal(market.companies.length, 38);
  assert.ok(market.composite > 0);
  assert.ok(market.totalVolume > 0);
  assert.ok(Date.parse(market.nextUpdateAt) > Date.parse(market.asOf));
  for (const company of market.companies) {
    assert.match(company.ticker, /^[A-Z]{3,4}$/);
    assert.ok(company.price > 0);
    assert.ok(company.open > 0);
    assert.ok(company.previousClose > 0);
    assert.equal(company.history.length, 49);
  }
  assert.ok(market.companies.some((company) => company.influence.includes("Redstone")));
  assert.ok(market.companies.some((company) => company.influence.includes("Nether")));
  assert.ok(market.companies.some((company) => company.influence.toLowerCase().includes("music discs")));
  assert.equal(new Set(market.companies.map((company) => company.ticker)).size, 38);
});

test("removes starter assets and packages production metadata", async () => {
  const [packageJson, hosting, layout, socialCard] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    access(new URL("../public/og.png", import.meta.url)),
  ]);
  assert.doesNotMatch(packageJson, /react-loading-skeleton|site-creator-vinext-starter/);
  assert.doesNotMatch(layout, /codex-preview|Starter Project|favicon\.svg/);
  assert.deepEqual(JSON.parse(hosting), { project_id: null, d1: null, r2: null });
  assert.equal(socialCard, undefined);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});
