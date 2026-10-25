import assert from "node:assert/strict";
import { test } from "node:test";
import { activeMonthlySubscriptions, checkoutBlockReason, resolveMembership } from "../supabase/functions/_shared/entitlement.ts";

const periodEnd = 1795046400;
const item = { price: { id: "price_monthly" }, current_period_end: periodEnd };

test("recognizes a paid monthly subscription with an item-level renewal date", () => {
  const result = activeMonthlySubscriptions([{ id: "sub_paid", status: "active", items: { data: [item] } }], "price_monthly");
  assert.deepEqual(result, [{ id: "sub_paid", validUntil: new Date(periodEnd * 1000).toISOString(), cancelAtPeriodEnd: false }]);
});

test("supports subscriptions that still include the top-level renewal date", () => {
  const result = activeMonthlySubscriptions([{ id: "sub_legacy", status: "trialing", current_period_end: periodEnd, items: { data: [{ price: "price_monthly" }] } }], "price_monthly");
  assert.equal(result[0]?.id, "sub_legacy");
  assert.equal(result[0]?.validUntil, new Date(periodEnd * 1000).toISOString());
});

test("does not grant monthly access for an inactive or unrelated subscription", () => {
  assert.deepEqual(activeMonthlySubscriptions([{ id: "sub_unpaid", status: "incomplete", items: { data: [item] } }], "price_monthly"), []);
  assert.deepEqual(activeMonthlySubscriptions([{ id: "sub_other", status: "active", items: { data: [item] } }], "price_other"), []);
});

test("does not grant access without a renewal date", () => {
  assert.throws(() => activeMonthlySubscriptions([{ id: "sub_missing_date", status: "active", items: { data: [{ price: "price_monthly" }] } }], "price_monthly"), /renewal date/);
});

test("reports all active subscriptions and scheduled cancellations", () => {
  const subscriptions = [
    { id: "sub_first", status: "active", cancel_at_period_end: true, items: { data: [item] } },
    { id: "sub_second", status: "past_due", items: { data: [item] } },
  ];
  assert.deepEqual(activeMonthlySubscriptions(subscriptions, "price_monthly").map(({ id, cancelAtPeriodEnd }) => ({ id, cancelAtPeriodEnd })), [
    { id: "sub_first", cancelAtPeriodEnd: true },
    { id: "sub_second", cancelAtPeriodEnd: false },
  ]);
});

test("Lifetime takes precedence after purchase while the monthly period is still active", () => {
  const active = activeMonthlySubscriptions([{ id: "sub_monthly", status: "active", cancel_at_period_end: true, items: { data: [item] } }], "price_monthly");
  assert.equal(resolveMembership(active, false).plan, "premium");
  assert.equal(resolveMembership(active, false).cancelAtPeriodEnd, true);
  assert.equal(resolveMembership(active, true).plan, "lifetime");
  assert.equal(resolveMembership(active, true).validUntil, null);
});

test("checkout blocks duplicate charges and requires cancellation before Lifetime", () => {
  const active = activeMonthlySubscriptions([{ id: "sub_monthly", status: "active", items: { data: [item] } }], "price_monthly");
  assert.match(checkoutBlockReason("premium", active, false), /already active/);
  assert.match(checkoutBlockReason("lifetime", active, false), /Cancel monthly renewal/);
  assert.equal(checkoutBlockReason("lifetime", [{ ...active[0], cancelAtPeriodEnd: true }], false), null);
  assert.match(checkoutBlockReason("premium", [], true), /Lifetime access/);
});
