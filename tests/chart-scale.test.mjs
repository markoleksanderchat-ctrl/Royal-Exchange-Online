import assert from "node:assert/strict";
import test from "node:test";
import { priceAxis, timeAxis } from "../lib/chart-scale.ts";

test("price axes retain prices and the previous close with padded rounded intervals", () => {
  for (const [values, reference] of [[[1013.57, 1003.15, 1014.19], 1007.52], [[50, 50], 50], [[0.01, 0.02], 0.03], [[130, 132], 125]]) {
    const axis = priceAxis(values, reference);
    assert.ok(axis.minimum < Math.min(...values, reference));
    assert.ok(axis.maximum > Math.max(...values, reference));
    assert.ok(axis.ticks.length >= 3 && axis.ticks.length <= 8);
    assert.ok(axis.ticks.every(Number.isFinite));
    const step = axis.ticks[1] - axis.ticks[0];
    assert.ok(axis.ticks.every((value, i) => i === 0 || Math.abs(value - axis.ticks[i - 1] - step) < 1e-6));
  }
  assert.ok(priceAxis([1000, 1000]).maximum - priceAxis([1000, 1000]).minimum >= 1,
    "a flat price should not acquire an exaggerated full-height chart");
});

test("intraday labels use Eastern clock times, stay within the observed range and fit narrow charts", () => {
  const points = [{ time: "2026-10-01T16:35:00Z", value: 1000 }, { time: "2026-10-02T16:30:00Z", value: 1001 }];
  for (const width of [225, 600]) {
    const ticks = timeAxis(points, width);
    assert.ok(ticks.length >= 2 && ticks.length <= 5);
    assert.ok(ticks.every(tick => tick.time >= Date.parse(points[0].time) && tick.time <= Date.parse(points.at(-1).time)));
    assert.ok(ticks.every(tick => /(?:AM|PM)$/.test(tick.label)));
  }
  assert.ok(timeAxis([{ time: "2026-01-01T14:00:00Z", value: 1 }, { time: "2026-01-01T17:00:00Z", value: 2 }], 600)
    .some(tick => tick.label === "10:00 AM"));
  assert.deepEqual(timeAxis([], 600), []);
  assert.deepEqual(timeAxis([points[0]], 600), []);
});

test("longer ranges label dates rather than repeating intraday clock times", () => {
  const points = [{ time: "2026-09-01T04:00:00Z", value: 1 }, { time: "2026-10-01T04:00:00Z", value: 2 }];
  assert.ok(timeAxis(points, 600).every(tick => /^(Sep|Oct) \d+$/.test(tick.label)));
});
