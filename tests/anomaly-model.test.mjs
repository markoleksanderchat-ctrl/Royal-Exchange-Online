import assert from "node:assert/strict";
import test from "node:test";

import { createRandomAnomaly } from "../lib/anomalies.ts";
import { anomalyImpactAt, getMarketSnapshot, COMPANIES, initialIssuerState, marketTickAt, runClearingSession } from "../lib/market.ts";

function sequence(...values) {
  let index = 0;
  return () => values[index++ % values.length];
}

test("anomalies have unique identities, bounded lifetimes and severity-scaled impact", () => {
  const at = Date.UTC(2026, 6, 30, 12);
  const notice = createRandomAnomaly(at, 1, sequence(0, 0.01, 0.3, 0.4, 0.2));
  const crisis = createRandomAnomaly(at, 2, sequence(0.9, 0.999, 0.7, 0.8, 0.6));
  assert.notEqual(notice.id, crisis.id);
  assert.equal(notice.severity, "notice");
  assert.equal(crisis.severity, "crisis");
  assert.ok(Math.abs(notice.peakImpactPercent) >= 2.5 && Math.abs(notice.peakImpactPercent) <= 5.5);
  assert.ok(Math.abs(crisis.peakImpactPercent) >= 21 && Math.abs(crisis.peakImpactPercent) <= 30);
  assert.ok(notice.startedAtEpochMillis < notice.peaksAtEpochMillis);
  assert.ok(notice.peaksAtEpochMillis < notice.endsAtEpochMillis);
});

test("anomaly phases rise, peak and recover without affecting unrelated issuers", () => {
  const at = Date.UTC(2026, 6, 30, 12);
  const anomaly = createRandomAnomaly(at, 7, sequence(0, 0.7, 0.5, 0.8, 0));
  const peak = anomalyImpactAt(anomaly, anomaly.peaksAtEpochMillis);
  const recovered = anomalyImpactAt(anomaly, anomaly.endsAtEpochMillis);
  assert.ok(Math.abs(peak) > 1);
  assert.equal(recovered, 0);

  const snapshot = getMarketSnapshot(new Date(anomaly.peaksAtEpochMillis), [anomaly]);
  assert.equal(snapshot.events.length, 1);
  assert.equal(snapshot.event.id, anomaly.id);
  assert.equal(snapshot.event.severity, anomaly.severity);
  const tick = marketTickAt(new Date("2026-07-30T15:00:00Z"));
  const active = {...anomaly, startedAtEpochMillis:(tick-10)*60000,peaksAtEpochMillis:tick*60000,endsAtEpochMillis:(tick+20)*60000};
  for (const definition of COMPANIES) {
    const state = initialIssuerState(definition, definition.base, tick-5);
    const calm = runClearingSession(definition,state,tick);
    const stressed = runClearingSession(definition,state,tick,[active]);
    if (!active.affectedTickers.includes(definition.ticker)) assert.deepEqual(stressed,calm);
    else assert.notEqual(stressed.state.demandIndex,calm.state.demandIndex);
  }
});
