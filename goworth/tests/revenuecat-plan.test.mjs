import assert from "node:assert/strict";
import { test } from "node:test";
import { planFromRevenueCat } from "../supabase/functions/_shared/revenuecat-plan.ts";

const now = Date.parse("2026-10-15T12:00:00Z");
const subscriber = (value) => ({ entitlements: { goworth_unlimited: value } });

test("a confirmed non-expiring purchase grants lifetime access", () => {
  assert.deepEqual(planFromRevenueCat(subscriber({ product_identifier: "lifetime", expires_date: null }), now),
    { plan: "lifetime", validUntil: null, productId: "lifetime" });
});

test("monthly access expires and honors a store grace period", () => {
  const active = planFromRevenueCat(subscriber({ product_identifier: "monthly", expires_date: "2026-11-15T12:00:00Z" }), now);
  assert.equal(active.plan, "premium");
  assert.equal(active.validUntil, "2026-11-15T12:00:00.000Z");
  const grace = planFromRevenueCat(subscriber({ product_identifier: "monthly", expires_date: "2026-10-14T12:00:00Z", grace_period_expires_date: "2026-10-17T12:00:00Z" }), now);
  assert.equal(grace.plan, "premium");
  assert.equal(planFromRevenueCat(subscriber({ product_identifier: "monthly", expires_date: "2026-10-14T12:00:00Z" }), now).plan, "free");
});

test("missing or malformed evidence cannot grant paid access", () => {
  assert.equal(planFromRevenueCat({}, now).plan, "free");
  assert.equal(planFromRevenueCat(subscriber({ expires_date: null }), now).plan, "free");
  assert.equal(planFromRevenueCat(subscriber({ product_identifier: "monthly", expires_date: "bad" }), now).plan, "free");
});
