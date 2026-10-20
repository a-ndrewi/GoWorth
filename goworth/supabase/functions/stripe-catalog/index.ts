import { stripeRequest } from "../_shared/stripe.ts";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });
  const secret = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!secret) return reply(503, { error: "Stripe is not configured yet." });
  const monthly = Deno.env.get("STRIPE_PRICE_MONTHLY_ID")?.trim();
  const lifetime = Deno.env.get("STRIPE_PRICE_LIFETIME_ID")?.trim();
  if (!monthly || !lifetime) return reply(503, { error: "Stripe prices are not configured yet." });
  try {
    const [monthlyPrice, lifetimePrice] = await Promise.all([
      stripeRequest<{ unit_amount: number | null; currency: string }>(secret, `prices/${monthly}`),
      stripeRequest<{ unit_amount: number | null; currency: string }>(secret, `prices/${lifetime}`),
    ]);
    const display = (price: typeof monthlyPrice) => price.unit_amount == null ? null : new Intl.NumberFormat("en-US", { style: "currency", currency: price.currency.toUpperCase() }).format(price.unit_amount / 100);
    return reply(200, { monthlyPrice: display(monthlyPrice), lifetimePrice: display(lifetimePrice), managementUrl: null });
  } catch (error) { return reply(503, { error: error instanceof Error ? error.message : "Stripe catalog is unavailable." }); }
});
