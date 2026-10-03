import assert from "node:assert/strict";
import test from "node:test";
import { COMPANIES, initialIssuerState, runClearingSession, buildMarketSnapshot } from "../lib/market.ts";

function correlation(left, right) {
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const a = mean(left), b = mean(right);
  return left.reduce((sum, value, i) => sum + (value - a) * (right[i] - b), 0)
    / Math.sqrt(left.reduce((sum, value) => sum + (value - a) ** 2, 0)
      * right.reduce((sum, value) => sum + (value - b) ** 2, 0));
}

for (const date of ["2026-04-01T04:00:00Z", "2026-09-22T04:00:00Z"]) {
  test(`persistent small moves, volatility clusters and uncommon shocks over ${date}`, () => {
    const definition = COMPANIES.find(company => company.ticker === "WIRE");
    const tick = Date.parse(date) / 60_000;
    let state = initialIssuerState(definition, definition.base, tick - 5);
    const returns = [];
    for (let i = 0; i < 288 * 10; i++) {
      const result = runClearingSession(definition, state, tick + i * 5);
      if (i === 500) {
        assert.deepEqual(runClearingSession(definition, JSON.parse(JSON.stringify(state)), tick + i * 5), result,
          "restoring persisted state must reproduce the same orders, quote, momentum and variance");
      }
      returns.push((result.company.price - state.lastPrice) / state.lastPrice);
      assert.ok(result.company.price > 0 && result.company.bid < result.company.ask);
      state = result.state;
    }
    const absolute = returns.map(Math.abs);
    const sorted = [...absolute].sort((a, b) => a - b);
    assert.ok(absolute.filter(value => value < 0.0015).length / absolute.length > 0.85);
    assert.ok(sorted.at(-1) > sorted[Math.floor(sorted.length / 2)] * 6, "rare moves exceed ordinary noise");
    assert.ok(absolute.filter(value => value > 0.003).length / absolute.length < 0.06, "large moves remain uncommon");
    const persistence = correlation(returns.slice(1), returns.slice(0, -1));
    assert.ok(persistence > 0.15 && persistence < 0.65, "momentum survives briefly without smoothing away tick variation");
    assert.ok(correlation(absolute.slice(1), absolute.slice(0, -1)) > 0.2, "turbulent moves occur in clusters");
    const windows = Array.from({ length: returns.length / 12 }, (_, i) =>
      Math.sqrt(returns.slice(i * 12, i * 12 + 12).reduce((sum, value) => sum + value ** 2, 0) / 12)).sort((a, b) => a - b);
    assert.ok(windows[Math.floor(windows.length * 0.9)] / windows[Math.floor(windows.length * 0.1)] > 2);
    const reversals = returns.slice(1).filter((value, i) => value * returns[i] < 0).length / (returns.length - 1);
    assert.ok(reversals > 0.1 && reversals < 0.45, "movement neither alternates mechanically nor follows a smooth one-way curve");
  });
}

test("RXC equals weighted constituent clearing prices on every observation", () => {
  const start = Date.parse("2026-10-01T04:00:00Z") / 60_000;
  let states = COMPANIES.map(company => initialIssuerState(company, company.base, start - 5));
  const base = COMPANIES.reduce((sum, company) => sum + company.base * company.weight, 0);
  for (let i = 0; i < 289; i++) {
    const tick = start + i * 5;
    const results = COMPANIES.map((company, index) => runClearingSession(company, states[index], tick));
    states = results.map(result => result.state);
    const snapshot = buildMarketSnapshot(new Date(tick * 60_000), results.map(result => result.company));
    const weighted = results.reduce((sum, result, index) => sum + result.company.price * COMPANIES[index].weight, 0);
    assert.equal(snapshot.composite, Number((weighted / base * 1000).toFixed(2)));
  }
});
