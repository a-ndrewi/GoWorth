import { createClient } from "npm:@supabase/supabase-js@2";
import { stripeCustomersForUser, stripeSubscriptionsForCustomer } from "../_shared/customers.ts";
import { activeMonthlySubscriptions } from "../_shared/entitlement.ts";
import { formBody, stripeRequest } from "../_shared/stripe.ts";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  const monthlyPriceId = Deno.env.get("STRIPE_PRICE_MONTHLY_ID")?.trim();
  if (!url || !serviceKey || !secret || !monthlyPriceId) return reply(503, { error: "Stripe is not configured yet." });
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return reply(401, { error: "Sign in required" });
  const service = createClient(url, serviceKey);
  const { data: auth, error: authError } = await service.auth.getUser(authorization.slice(7));
  if (authError || !auth.user) return reply(401, { error: "Sign in required" });
  const body = await request.json().catch(() => ({}));
  if (body?.action !== "cancel_renewal") return reply(400, { error: "Unsupported subscription action" });
  try {
    const customers = await stripeCustomersForUser(secret, auth.user.id, auth.user.email);
    const active: ReturnType<typeof activeMonthlySubscriptions> = [];
    for (const customer of customers) {
      const subscriptions = await stripeSubscriptionsForCustomer(secret, customer.id);
      active.push(...activeMonthlySubscriptions(subscriptions, monthlyPriceId));
    }
    if (!active.length) return reply(404, { error: "No active monthly subscription was found." });
    for (const subscription of active) {
      if (subscription.cancelAtPeriodEnd) continue;
      await stripeRequest(secret, `subscriptions/${subscription.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ cancel_at_period_end: "true" }),
      });
    }
    return reply(200, { cancelAtPeriodEnd: true });
  } catch (error) { return reply(503, { error: error instanceof Error ? error.message : "Could not cancel monthly renewal." }); }
});
