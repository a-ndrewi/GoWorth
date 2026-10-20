import assert from "node:assert/strict";
import { test } from "node:test";
import { hasPaidLifetimeCheckout, stripeCustomersForUser, stripeSubscriptionsForCustomer } from "../supabase/functions/_shared/customers.ts";

async function withStripeResponses(respond, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => new Response(JSON.stringify(respond(new URL(input))), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  try { return await run(); }
  finally { globalThis.fetch = originalFetch; }
}

test("restore finds customers from both current email and account metadata", async () => {
  const customers = await withStripeResponses((url) => {
    if (url.pathname.endsWith("/customers")) return { data: [{ id: "cus_current", metadata: { user_id: "user_1" } }, { id: "cus_other", metadata: { user_id: "user_2" } }], has_more: false };
    if (url.pathname.endsWith("/customers/search")) return { data: [{ id: "cus_previous_email", metadata: { user_id: "user_1" } }] };
    throw new Error(`Unexpected path: ${url.pathname}`);
  }, () => stripeCustomersForUser("sk_test_example", "user_1", "current@example.com"));
  assert.deepEqual(customers.map(({ id }) => id), ["cus_current", "cus_previous_email"]);
});

test("restore checks later checkout pages and only accepts purchases for the signed-in user", async () => {
  const paid = await withStripeResponses((url) => {
    assert.equal(url.searchParams.get("customer"), "cus_1");
    if (!url.searchParams.has("starting_after")) return { data: [{ id: "cs_1", payment_status: "paid", metadata: { plan: "lifetime", user_id: "other_user" } }], has_more: true };
    return { data: [{ id: "cs_2", payment_status: "paid", metadata: { plan: "lifetime", user_id: "user_1" } }], has_more: false };
  }, () => hasPaidLifetimeCheckout("sk_test_example", "cus_1", "user_1"));
  assert.equal(paid, true);
});

test("monthly subscriptions are collected across pages before a plan change", async () => {
  const subscriptions = await withStripeResponses((url) => {
    if (!url.searchParams.has("starting_after")) return { data: [{ id: "sub_1", status: "active" }], has_more: true };
    return { data: [{ id: "sub_2", status: "active" }], has_more: false };
  }, () => stripeSubscriptionsForCustomer("sk_test_example", "cus_1"));
  assert.deepEqual(subscriptions.map(({ id }) => id), ["sub_1", "sub_2"]);
});
