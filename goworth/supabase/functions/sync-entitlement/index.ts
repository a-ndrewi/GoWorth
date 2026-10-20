import { createClient } from "npm:@supabase/supabase-js@2";
import { hasPaidLifetimeCheckout, stripeCustomersForUser, stripeSubscriptionsForCustomer } from "../_shared/customers.ts";
import { activeMonthlySubscriptions, resolveMembership } from "../_shared/entitlement.ts";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!url || !serviceKey || !secret) return reply(503, { error: "Stripe is not configured yet." });
  const monthlyPriceId = Deno.env.get("STRIPE_PRICE_MONTHLY_ID")?.trim();
  if (!monthlyPriceId) return reply(503, { error: "Stripe monthly price is not configured yet." });
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return reply(401, { error: "Sign in required" });
  const service = createClient(url, serviceKey);
  const { data: auth, error: authError } = await service.auth.getUser(authorization.slice(7));
  if (authError || !auth.user) return reply(401, { error: "Sign in required" });
  try {
    const customers = await stripeCustomersForUser(secret, auth.user.id, auth.user.email);
    const activeSubscriptions: ReturnType<typeof activeMonthlySubscriptions> = [];
    for (const customer of customers) {
      const subscriptions = await stripeSubscriptionsForCustomer(secret, customer.id);
      activeSubscriptions.push(...activeMonthlySubscriptions(subscriptions, monthlyPriceId));
    }
    let lifetimePaid = false;
    for (const customer of customers) {
      if (await hasPaidLifetimeCheckout(secret, customer.id, auth.user.id)) {
        lifetimePaid = true;
        break;
      }
    }
    const { plan, validUntil, providerReference, cancelAtPeriodEnd } = resolveMembership(activeSubscriptions, lifetimePaid);
    const { error: writeError } = await service.from("user_entitlements").upsert({ user_id: auth.user.id, plan, valid_until: validUntil, provider: "stripe", provider_reference: providerReference, updated_at: new Date().toISOString() });
    if (writeError) return reply(503, { error: "Could not update your membership." });
    return reply(200, { plan, validUntil, cancelAtPeriodEnd, managementUrl: null });
  } catch (error) { return reply(503, { error: error instanceof Error ? error.message : "Could not verify your membership right now." }); }
});
