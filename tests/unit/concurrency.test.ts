import assert from "node:assert/strict";
import { test } from "node:test";
import { mapWithConcurrency } from "../../sandbox/src/concurrency";

test("Sandbox hält das Parallelitätslimit und die Eingabereihenfolge ein", async () => {
  let active = 0;
  let peak = 0;
  const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve) => setImmediate(resolve));
    active -= 1;
    return value * 2;
  });
  assert.equal(peak, 2);
  assert.deepEqual(result, [2, 4, 6, 8, 10]);
});

test("ungültige Parallelität schlägt explizit fehl, statt Aufgaben zu überspringen", async () => {
  for (const value of [0, -1, NaN, Infinity, 0.5]) {
    await assert.rejects(mapWithConcurrency([1], value, async (item) => item), RangeError);
  }
});
