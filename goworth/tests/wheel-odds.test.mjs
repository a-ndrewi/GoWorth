import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { wheelOdds, wheelRemainingMs, wheelSlices, wheelTargetRotation } from "../src/lib/wheel-odds.ts";

const migration = readFileSync(new URL("../supabase/migrations/20261027120000_premium_wheel.sql", import.meta.url), "utf8");

test("displayed odds match the odds the database applies", () => {
  const thresholds = /roll < ([\d.]+) then 'lifetime' when roll < ([\d.]+) then 'premium_month'/.exec(migration);
  assert.ok(thresholds, "spin_premium_wheel thresholds not found");
  assert.equal(Number(thresholds[1]), wheelOdds.lifetime);
  assert.ok(Math.abs(Number(thresholds[2]) - (wheelOdds.lifetime + wheelOdds.premiumMonth)) < 1e-12);
});

test("every spin lands on a slice that shows the prize", () => {
  const sliceAngle = 360 / wheelSlices.length;
  for (const prize of ["none", "premium_month", "lifetime"]) {
    for (const pick of [0, 0.4, 0.99]) {
      const rotation = wheelTargetRotation(725, prize, pick);
      assert.ok(rotation >= 725 + 5 * 360 - 360, "spins forward several turns");
      const underPointer = Math.round(((360 - (rotation % 360)) % 360) / sliceAngle) % wheelSlices.length;
      assert.equal(wheelSlices[underPointer], prize);
    }
  }
});

test("cooldown uses server time rather than the device clock", () => {
  const next = "2026-10-28T10:00:00.000Z";
  const deviceNow = Date.parse("2026-10-28T09:00:00.000Z");
  assert.equal(wheelRemainingMs(next, 0, deviceNow), 60 * 60 * 1000);
  assert.equal(wheelRemainingMs(next, 30 * 60 * 1000, deviceNow), 30 * 60 * 1000);
  assert.equal(wheelRemainingMs(null, 0, deviceNow), 0);
  assert.equal(wheelRemainingMs(next, 2 * 60 * 60 * 1000, deviceNow), 0);
});
