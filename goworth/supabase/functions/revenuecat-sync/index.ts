import { createClient } from "npm:@supabase/supabase-js@2";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const entitlementId = () => Deno.env.get("REVENUECAT_ENTITLEMENT_ID")?.trim() || "premium";

type Subscriber = {
  entitlements?: Record<string, { expires_date: string | null; grace_period_expires_date?: string | null; product_identifier: string }>;
  subscriptions?: Record<string, { store?: string; is_sandbox?: boolean; unsubscribe_detected_at?: string | null; billing_issues_detected_at?: string | null }>;
  non_subscriptions?: Record<string, { store?: string; is_sandbox?: boolean }[]>;
};

/** Reads the account's Premium entitlement from RevenueCat's own record, so the row never depends on webhook order. */
function storeRow(userId: string, subscriber: Subscriber) {
  const empty = { user_id: userId, plan: "free", valid_until: null, product_id: null, store: null, sandbox: false, will_renew: null, refreshed_at: new Date().toISOString() };
  const entitlement = subscriber.entitlements?.[entitlementId()];
  if (!entitlement) return empty;
  const product = entitlement.product_identifier;
  const subscription = subscriber.subscriptions?.[product];
  const oneTime = subscriber.non_subscriptions?.[product]?.at(-1);
  const details = {
    product_id: product, store: subscription?.store ?? oneTime?.store ?? null,
    sandbox: subscription?.is_sandbox ?? oneTime?.is_sandbox ?? false,
    will_renew: subscription ? !subscription.unsubscribe_detected_at && !subscription.billing_issues_detected_at : null,
  };
  if (entitlement.expires_date === null) return { ...empty, ...details, plan: "lifetime", will_renew: null };
  const end = [entitlement.expires_date, entitlement.grace_period_expires_date].filter(Boolean).map((value) => Date.parse(value!)).reduce((a, b) => Math.max(a, b), 0);
  if (end <= Date.now()) return empty;
  return { ...empty, ...details, plan: "premium", valid_until: new Date(end).toISOString() };
}

/**
 * Brings store_entitlements up to date with RevenueCat for one or more accounts.
 * Called two ways: by the app right after a purchase or restore (with the user's session), and by the
 * RevenueCat webhook (with REVENUECAT_WEBHOOK_AUTH as its Authorization header) for renewals, expiries and refunds.
 * Both paths fetch the subscriber from the RevenueCat REST API rather than trusting a request body.
 * Requires the REVENUECAT_SECRET_KEY and REVENUECAT_WEBHOOK_AUTH secrets; deploy with --no-verify-jwt.
 */
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secretKey = Deno.env.get("REVENUECAT_SECRET_KEY")?.trim();
  const webhookAuth = Deno.env.get("REVENUECAT_WEBHOOK_AUTH")?.trim();
  const authHeader = request.headers.get("Authorization") ?? "";
  if (!url || !serviceKey || !secretKey) return reply(503, { error: "Purchases are unavailable right now. Please try again later." });
  const service = createClient(url, serviceKey);

  let userIds: string[];
  const fromWebhook = !!webhookAuth && authHeader === `Bearer ${webhookAuth}`;
  if (fromWebhook) {
    let body: { event?: { app_user_id?: string; original_app_user_id?: string; aliases?: string[]; transferred_from?: string[]; transferred_to?: string[] } };
    try { body = await request.json(); }
    catch { return reply(400, { error: "Invalid request" }); }
    const event = body.event ?? {};
    // A transfer moves a purchase between accounts, so both sides are refreshed. Anonymous RevenueCat ids are skipped.
    userIds = [...new Set([event.app_user_id, event.original_app_user_id, ...(event.aliases ?? []), ...(event.transferred_from ?? []), ...(event.transferred_to ?? [])]
      .filter((id): id is string => typeof id === "string" && uuid.test(id)))];
  } else {
    if (!authHeader.startsWith("Bearer ")) return reply(401, { error: "Sign in required" });
    const { data: auth, error } = await service.auth.getUser(authHeader.slice(7));
    if (error || !auth.user) return reply(401, { error: "Sign in required" });
    userIds = [auth.user.id];
  }

  const rows = [];
  for (const userId of userIds) {
    const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    });
    if (!response.ok) {
      console.error("RevenueCat lookup failed", response.status, await response.text().catch(() => ""));
      return reply(502, { error: "Could not confirm your purchase right now. Please try Restore purchases in a moment." });
    }
    const { subscriber } = await response.json() as { subscriber: Subscriber };
    rows.push(storeRow(userId, subscriber ?? {}));
  }
  for (const row of rows) {
    const { error } = await service.from("store_entitlements").upsert(row, { onConflict: "user_id" });
    // A webhook can name an account that was deleted since; that is not worth a retry.
    if (error && !(fromWebhook && error.code === "23503")) {
      console.error("Store entitlement write failed", error.message);
      return reply(500, { error: "Could not confirm your purchase right now. Please try Restore purchases in a moment." });
    }
  }
  return reply(200, fromWebhook ? { synced: rows.length } : { plan: rows[0]?.plan ?? "free", validUntil: rows[0]?.valid_until ?? null });
});
