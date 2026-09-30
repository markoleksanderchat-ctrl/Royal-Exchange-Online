import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import test from "node:test";

const app = (await import("../dist/server/index.js")).default;
const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };
async function page(route) {
  const response = await app.fetch(new Request("https://exchange.example" + route, { headers: { accept: "text/html" } }), env, ctx);
  assert.equal(response.status, 200, route);
  return response.text();
}

test("primary views render independently, including issuer deep links", async () => {
  const markets = await page("/markets");
  assert.match(markets, /Find an issuer/);
  assert.match(markets, /<table/);
  assert.match(markets, /scope="col"[\s\S]{0,30}>Ticker/);
  assert.match(markets, /href="\/markets\/WIRE"/);
  assert.doesNotMatch(markets, /id="market-heading"|Find a commodity|Your watchlist stays in this browser/);

  const book = await page("/price-book");
  assert.match(book, /Find a commodity/);
  assert.match(book, /registry ID/);
  assert.match(book, /Commodity trade/);
  assert.match(book, /1,332/);
  assert.match(book, /Prices are linked issuer quotes/);
  assert.match(book, /aria-label="Price Book pages"/);
  assert.doesNotMatch(book, /id="market-heading"|Market Highlights|Company Charter/);

  const ledger = await page("/my-ledger");
  assert.match(ledger, /Your watchlist stays in this browser/);
  assert.match(ledger, /Opening your ledger/);
  assert.doesNotMatch(ledger, /Find a commodity|Market Highlights|Company Charter/);

  const data = await page("/data");
  assert.match(data, /Public API/);
  assert.match(data, /\/openapi\.json/);
  assert.match(data, /No historical prices are invented or backfilled/);
  assert.match(data, /gameplay never writes back/);
  assert.doesNotMatch(data, /Find a commodity|Market Highlights|Company Charter/);

  const issuer = await page("/markets/WIRE");
  assert.match(issuer, /id="issuer-heading">Blanch Appleton Wiredrawers/);
  assert.match(issuer, /Company Charter/);
  assert.match(issuer, /Add to Ledger/);
  assert.match(issuer, /Previous close/);
  assert.match(issuer, /Bid \/ ask/);
  assert.match(issuer, /Recorded auctions only/);
  const invalid = await app.fetch(new Request("https://exchange.example/markets/NOTREAL"), env, ctx);
  assert.equal(invalid.status, 404);
});

test("every original catalogue entry has a bundled native item sprite", async () => {
  const catalogue = await readFile(new URL("../app/minecraft-items.ts", import.meta.url), "utf8");
  const ids = [...catalogue.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 1332);
  await Promise.all(ids.map((id) => access(new URL("../public/items/" + id + ".png", import.meta.url))));
});
