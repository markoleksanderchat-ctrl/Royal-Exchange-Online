import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPANIES,
  initialIssuerState,
  MARKET_MODEL_VERSION,
  marketSessionDayAt,
  marketSessionStartTick,
  marketTickAt,
  runClearingSession,
  getMarketSnapshot,
} from "../lib/market.ts";

const WIRE = COMPANIES.find((company) => company.ticker === "WIRE");

test("market sessions follow Eastern midnight in standard and daylight time", () => {
  assert.equal(marketSessionDayAt(new Date("2026-08-12T03:59:00Z")), "2026-08-11");
  assert.equal(marketSessionDayAt(new Date("2026-08-12T04:00:00Z")), "2026-08-12");
  assert.equal(marketSessionDayAt(new Date("2026-01-12T04:59:00Z")), "2026-01-11");
  assert.equal(marketSessionDayAt(new Date("2026-01-12T05:00:00Z")), "2026-01-12");
  assert.equal(new Date(marketSessionStartTick(new Date("2026-08-12T12:00:00Z")) * 60_000).toISOString(), "2026-08-12T04:00:00.000Z");
  assert.equal(new Date(marketSessionStartTick(new Date("2026-01-12T12:00:00Z")) * 60_000).toISOString(), "2026-01-12T05:00:00.000Z");
});

test("session totals continue across UTC midnight and reset at Eastern midnight", () => {
  const beforeUtcMidnight = marketTickAt(new Date("2026-08-12T23:55:00Z"));
  const beforeEasternMidnight = marketTickAt(new Date("2026-08-13T03:55:00Z"));
  const atEasternMidnight = marketTickAt(new Date("2026-08-13T04:00:00Z"));
  const initial = initialIssuerState(WIRE, WIRE.base, beforeUtcMidnight - 5);
  const first = runClearingSession(WIRE, initial, beforeUtcMidnight);
  const afterUtcMidnight = runClearingSession(WIRE, first.state, beforeUtcMidnight + 5);
  const beforeEastern = runClearingSession(WIRE, afterUtcMidnight.state, beforeEasternMidnight);
  const afterEastern = runClearingSession(WIRE, beforeEastern.state, atEasternMidnight);

  assert.equal(afterUtcMidnight.company.volume, first.company.volume + afterUtcMidnight.trade.quantity);
  assert.equal(afterEastern.company.volume, afterEastern.trade.quantity);
  assert.equal(afterEastern.company.previousClose, beforeEastern.company.price);
});

test("matched orders, not a display formula, create price and volume", () => {
  const tick = marketTickAt(new Date("2026-08-12T12:00:00Z"));
  const initial = initialIssuerState(WIRE, WIRE.base, tick - 5);
  const first = runClearingSession(WIRE, initial, tick);
  const repeated = runClearingSession(WIRE, initial, tick);

  assert.deepEqual(first, repeated, "the same persisted state and tick must clear identically");
  assert.ok(first.trade.tradeCount > 0);
  assert.ok(first.trade.quantity > 0);
  assert.equal(first.company.trades, first.trade.tradeCount);
  assert.equal(first.company.volume, first.trade.quantity);
  assert.equal(first.company.price, first.trade.price);
  assert.ok(first.company.bid < first.company.ask);
  assert.equal(first.company.spread, Number((first.company.ask - first.company.bid).toFixed(2)));
});

test("issuer fundamentals and session totals persist across clearings", () => {
  const tick = marketTickAt(new Date("2026-08-12T12:00:00Z"));
  const initial = initialIssuerState(WIRE, WIRE.base, tick - 5);
  const first = runClearingSession(WIRE, initial, tick);
  const second = runClearingSession(WIRE, first.state, tick + 5);

  assert.equal(second.state.lastTick, tick + 5);
  assert.equal(second.company.volume, first.company.volume + second.trade.quantity);
  assert.equal(second.state.totalTrades, first.state.totalTrades + second.trade.tradeCount);
  assert.notEqual(second.state.demandIndex, initial.demandIndex);
  assert.notEqual(second.state.earningsIndex, initial.earningsIndex);
});

test("notices change supply and demand rather than adding a preset price percentage", () => {
  const tick = marketTickAt(new Date("2026-08-12T12:00:00Z"));
  const initial = initialIssuerState(WIRE, WIRE.base, tick - 5);
  const anomaly = {
    id: "test-redstone-shortage",
    templateKey: "test",
    title: "Redstone shortage",
    description: "Supply is constrained.",
    tone: "positive",
    severity: "severe",
    sector: "Redstone",
    affectedTickers: ["WIRE"],
    peakImpactPercent: 18,
    shape: "squeeze",
    startedAtEpochMillis: (tick - 10) * 60_000,
    peaksAtEpochMillis: tick * 60_000,
    endsAtEpochMillis: (tick + 20) * 60_000,
  };
  const calm = runClearingSession(WIRE, initial, tick);
  const stressed = runClearingSession(WIRE, initial, tick, [anomaly]);

  assert.ok(stressed.state.demandIndex > calm.state.demandIndex);
  assert.ok(stressed.state.supplyIndex < calm.state.supplyIndex);
  assert.notEqual(stressed.company.changePercent, anomaly.peakImpactPercent);
});

test("the public fallback uses the clearing model and genuine matched totals", () => {
  const snapshot = getMarketSnapshot(new Date("2026-08-12T12:00:00Z"));
  assert.equal(snapshot.modelVersion, MARKET_MODEL_VERSION);
  assert.equal(snapshot.totalVolume, snapshot.companies.reduce((sum, company) => sum + company.volume, 0));
  assert.ok(snapshot.companies.every((company) => company.bid < company.ask));
  assert.ok(snapshot.companies.some((company) => company.trades > 0));
});
