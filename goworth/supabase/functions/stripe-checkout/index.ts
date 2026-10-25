import { createClient } from "npm:@supabase/supabase-js@2";
import { hasPaidLifetimeCheckout, stripeCustomersForUser, stripeSubscriptionsForCustomer } from "../_shared/customers.ts";
import { activeMonthlySubscriptions, checkoutBlockReason } from "../_shared/entitlement.ts";
import { formBody, stripeRequest } from "../_shared/stripe.ts";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!url || !serviceKey || !secret) return reply(503, { error: "Stripe is not configured yet." });
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return reply(401, { error: "Sign in required" });
  const service = createClient(url, serviceKey);
  const { data: auth, error: authError } = await service.auth.getUser(authorization.slice(7));
  if (authError || !auth.user) return reply(401, { error: "Sign in required" });
  const body = await request.json().catch(() => ({}));
  const plan = body?.plan === "lifetime" ? "lifetime" : body?.plan === "premium" ? "premium" : null;
  const price = plan === "premium" ? Deno.env.get("STRIPE_PRICE_MONTHLY_ID") : plan === "lifetime" ? Deno.env.get("STRIPE_PRICE_LIFETIME_ID") : undefined;
  if (!plan || !price) return reply(400, { error: "Choose a valid membership plan." });
  const origin = Deno.env.get("STRIPE_CHECKOUT_ORIGIN") || request.headers.get("Origin") || "https://localhost";
  try {
    const customers = await stripeCustomersForUser(secret, auth.user.id, auth.user.email);
    const monthlyPriceId = Deno.env.get("STRIPE_PRICE_MONTHLY_ID")?.trim();
    if (!monthlyPriceId) return reply(503, { error: "Stripe monthly price is not configured yet." });
    const active: ReturnType<typeof activeMonthlySubscriptions> = [];
    let lifetimePaid = false;
    for (const existing of customers) {
      const subscriptions = await stripeSubscriptionsForCustomer(secret, existing.id);
      active.push(...activeMonthlySubscriptions(subscriptions, monthlyPriceId));
      if (await hasPaidLifetimeCheckout(secret, existing.id, auth.user.id)) lifetimePaid = true;
    }
    const blocked = checkoutBlockReason(plan, active, lifetimePaid);
    if (blocked) return reply(409, { error: blocked });
    const customer = customers[0] ?? await stripeRequest<{ id: string }>(secret, "customers", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ email: auth.user.email || undefined, "metadata[user_id]": auth.user.id }) });
    const session = await stripeRequest<{ url: string }>(secret, "checkout/sessions", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ mode: plan === "premium" ? "subscription" : "payment", customer: customer.id, "line_items[0][price]": price, "line_items[0][quantity]": "1", "subscription_data[metadata][user_id]": plan === "premium" ? auth.user.id : undefined, "metadata[user_id]": auth.user.id, "metadata[plan]": plan, success_url: `${origin}/membership?stripe=success`, cancel_url: `${origin}/membership?stripe=cancelled` }) });
    return reply(200, { url: session.url });
  } catch (error) { return reply(503, { error: error instanceof Error ? error.message : "Could not start Stripe checkout." }); }
});
