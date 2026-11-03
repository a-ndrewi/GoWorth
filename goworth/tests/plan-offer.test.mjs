import assert from "node:assert/strict";
import { test } from "node:test";
import { freeTrialDays, planIdFor, yearlySavings } from "../src/lib/plan-offer.ts";

test("RevenueCat package types map to the three plans", () => {
  assert.equal(planIdFor("ANNUAL"), "yearly");
  assert.equal(planIdFor("MONTHLY"), "monthly");
  assert.equal(planIdFor("LIFETIME"), "lifetime");
  assert.equal(planIdFor("WEEKLY"), null);
});

test("yearly savings round down and never go negative", () => {
  assert.equal(yearlySavings(4.99, 29.99), 49);
  assert.equal(yearlySavings(5, 30), 50);
  assert.equal(yearlySavings(4.99, 59.88), 0);
  assert.equal(yearlySavings(4.99, 79.99), 0);
  assert.equal(yearlySavings(undefined, 29.99), 0);
});

test("only free introductory offers count as trials", () => {
  assert.equal(freeTrialDays({ price: 0, periodUnit: "DAY", periodNumberOfUnits: 7, cycles: 1 }), 7);
  assert.equal(freeTrialDays({ price: 0, periodUnit: "WEEK", periodNumberOfUnits: 2, cycles: 1 }), 14);
  assert.equal(freeTrialDays({ price: 0.99, periodUnit: "MONTH", periodNumberOfUnits: 1, cycles: 1 }), 0);
  assert.equal(freeTrialDays(null), 0);
});
